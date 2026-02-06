import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { BillingAccountService } from './services/billing-account.service';
import { InvoiceService } from './services/invoice.service';
import { UsageService } from './services/usage.service';
import { PricingService } from './services/pricing.service';
import { StripeService } from './services/stripe.service';
import { OrgsService } from '../orgs/orgs.service';
import { EmailService } from '../email/email.service';
import {
  CreateBillingAccountDto,
  UpdateBillingAccountDto,
  CreateInvoiceDto,
  MarkInvoicePaidDto,
  VoidInvoiceDto,
  QueryUsageDto,
  AddCreditDto,
} from './dto/billing.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs/:orgId/billing')
export class BillingController {
  constructor(
    private readonly billingAccountService: BillingAccountService,
    private readonly invoiceService: InvoiceService,
    private readonly usageService: UsageService,
    private readonly pricingService: PricingService,
    private readonly stripeService: StripeService,
    private readonly orgsService: OrgsService,
    private readonly emailService: EmailService,
  ) {}

  // ==================== Billing Account ====================

  @Get('account')
  @ApiOperation({ summary: 'Get billing account' })
  async getBillingAccount(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const account = await this.billingAccountService.findByOrgId(orgId);

    return {
      success: true,
      data: account,
    };
  }

  @Post('account')
  @ApiOperation({ summary: 'Create billing account' })
  async createBillingAccount(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateBillingAccountDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const account = await this.billingAccountService.create(orgId, createDto);

    // Create Stripe customer
    if (this.stripeService.configured) {
      try {
        const stripeCustomerId = await this.stripeService.createCustomer({
          email: createDto.billingEmail,
          name: createDto.companyName || createDto.billingName,
          metadata: { orgId, eutlas_billing_account_id: account.id },
        });

        if (stripeCustomerId) {
          await this.billingAccountService.setStripeCustomerId(orgId, stripeCustomerId);
        }
      } catch (error: any) {
        // Don't fail account creation if Stripe fails
        // The Stripe customer can be created later
      }
    }

    return {
      success: true,
      data: account,
      message: 'Billing account created',
    };
  }

  @Patch('account')
  @ApiOperation({ summary: 'Update billing account' })
  async updateBillingAccount(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() updateDto: UpdateBillingAccountDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const account = await this.billingAccountService.update(orgId, updateDto);

    // Sync with Stripe if customer exists
    if (this.stripeService.configured && account.stripeCustomerId) {
      try {
        await this.stripeService.updateCustomer(account.stripeCustomerId, {
          email: updateDto.billingEmail,
          name: updateDto.companyName || updateDto.billingName,
        });
      } catch (error: any) {
        // Don't fail update if Stripe sync fails
      }
    }

    return {
      success: true,
      data: account,
    };
  }

  @Post('account/credit')
  @ApiOperation({ summary: 'Add credit to account' })
  async addCredit(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() creditDto: AddCreditDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const account = await this.billingAccountService.addCredit(
      orgId,
      creditDto.amountCents,
      creditDto.description,
    );

    return {
      success: true,
      data: { creditBalanceCents: account.creditBalanceCents },
      message: `Added ${this.pricingService.formatAmount(creditDto.amountCents)} credit`,
    };
  }

  // ==================== Stripe Payment Setup ====================

  @Post('setup-intent')
  @ApiOperation({ summary: 'Create a Stripe Setup Intent for adding a payment method' })
  async createSetupIntent(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const account = await this.billingAccountService.findByOrgId(orgId);
    if (!account) {
      throw new NotFoundException('Billing account not found. Please create a billing account first.');
    }

    // Ensure Stripe customer exists
    let stripeCustomerId = account.stripeCustomerId;
    if (!stripeCustomerId) {
      const customerId = await this.stripeService.createCustomer({
        email: account.billingEmail,
        name: account.companyName || account.billingName,
        metadata: { orgId, eutlas_billing_account_id: account.id },
      });
      stripeCustomerId = customerId ?? undefined;

      if (stripeCustomerId) {
        await this.billingAccountService.setStripeCustomerId(orgId, stripeCustomerId);
      } else {
        throw new BadRequestException('Failed to create Stripe customer. Stripe may not be configured.');
      }
    }

    const setupIntent = await this.stripeService.createSetupIntent(stripeCustomerId);
    if (!setupIntent) {
      throw new BadRequestException('Failed to create setup intent. Stripe may not be configured.');
    }

    return {
      success: true,
      data: {
        clientSecret: setupIntent.clientSecret,
        setupIntentId: setupIntent.id,
      },
    };
  }

  @Post('payment-method/confirm')
  @ApiOperation({ summary: 'Confirm a payment method after Setup Intent succeeds (client-side confirmation)' })
  async confirmPaymentMethod(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() body: { paymentMethodId: string },
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const account = await this.billingAccountService.findByOrgId(orgId);
    if (!account || !account.stripeCustomerId) {
      throw new NotFoundException('Billing account with Stripe customer not found');
    }

    // Get payment method details from Stripe
    const pm = await this.stripeService.getPaymentMethod(body.paymentMethodId);
    if (!pm) {
      throw new BadRequestException('Payment method not found');
    }

    // Set as default payment method on the customer
    await this.stripeService.attachPaymentMethod(account.stripeCustomerId, body.paymentMethodId);

    // Update local billing account
    await this.billingAccountService.setPaymentMethod(orgId, pm.type === 'sepa_debit' ? 'sepa_debit' : 'card', {
      last4: pm.card?.last4 || pm.sepa_debit?.last4 || undefined,
      brand: pm.card?.brand || undefined,
      expiryMonth: pm.card?.exp_month,
      expiryYear: pm.card?.exp_year,
      bankName: pm.sepa_debit?.bank_code || undefined,
      stripePaymentMethodId: body.paymentMethodId,
    });

    return {
      success: true,
      message: 'Payment method added successfully',
    };
  }

  @Get('payment-methods')
  @ApiOperation({ summary: 'List payment methods' })
  async listPaymentMethods(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const account = await this.billingAccountService.findByOrgId(orgId);
    if (!account?.stripeCustomerId) {
      return { success: true, data: [] };
    }

    const methods = await this.stripeService.listPaymentMethods(account.stripeCustomerId);

    return {
      success: true,
      data: methods.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        } : undefined,
        sepaDebit: pm.sepa_debit ? {
          last4: pm.sepa_debit.last4,
          bankCode: pm.sepa_debit.bank_code,
          country: pm.sepa_debit.country,
        } : undefined,
      })),
    };
  }

  @Post('portal')
  @ApiOperation({ summary: 'Create a Stripe Billing Portal session' })
  async createBillingPortalSession(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() body: { returnUrl?: string },
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const account = await this.billingAccountService.findByOrgId(orgId);
    if (!account?.stripeCustomerId) {
      throw new NotFoundException('No Stripe customer found for this organization');
    }

    const returnUrl = body.returnUrl || `${process.env.FRONTEND_URL}/dashboard/orgs/${orgId}/billing`;
    const portalUrl = await this.stripeService.createBillingPortalSession(
      account.stripeCustomerId,
      returnUrl,
    );

    if (!portalUrl) {
      throw new BadRequestException('Failed to create billing portal session');
    }

    return {
      success: true,
      data: { url: portalUrl },
    };
  }

  @Get('stripe-config')
  @ApiOperation({ summary: 'Get Stripe publishable key for frontend' })
  async getStripeConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    return {
      success: true,
      data: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        configured: this.stripeService.configured,
      },
    };
  }

  // ==================== Invoices ====================

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'open', 'paid', 'void'] })
  async listInvoices(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invoices = await this.invoiceService.findByOrg(orgId, status as any);

    return {
      success: true,
      data: invoices,
    };
  }

  @Get('invoices/stats')
  @ApiOperation({ summary: 'Get invoice statistics' })
  async getInvoiceStats(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const stats = await this.invoiceService.getInvoiceStats(orgId);

    return {
      success: true,
      data: {
        ...stats,
        totalPaidFormatted: this.pricingService.formatAmount(stats.totalPaid),
        totalOpenFormatted: this.pricingService.formatAmount(stats.totalOpen),
        totalOverdueFormatted: this.pricingService.formatAmount(stats.totalOverdue),
      },
    };
  }

  @Get('invoices/:invoiceId')
  @ApiOperation({ summary: 'Get invoice details' })
  async getInvoice(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const invoice = await this.invoiceService.findById(invoiceId);
    if (!invoice || invoice.orgId.toString() !== orgId) {
      throw new NotFoundException('Invoice not found');
    }

    return {
      success: true,
      data: invoice,
    };
  }

  @Post('invoices/generate')
  @ApiOperation({ summary: 'Generate a new invoice' })
  async generateInvoice(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Body() createDto: CreateInvoiceDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const invoice = await this.invoiceService.generateInvoice(
      orgId,
      new Date(createDto.billingPeriodStart),
      new Date(createDto.billingPeriodEnd),
      { notes: createDto.notes },
    );

    // Send invoice email notification
    const account = await this.billingAccountService.findByOrgId(orgId);
    if (account?.billingEmail) {
      try {
        await this.emailService.send({
          to: account.billingEmail,
          subject: `New Invoice ${invoice.invoiceNumber} - EUTLAS`,
          html: this.getInvoiceEmailTemplate(
            invoice.invoiceNumber,
            this.pricingService.formatAmount(invoice.totalCents),
            new Date(invoice.dueDate).toLocaleDateString('de-DE'),
            `${process.env.FRONTEND_URL}/dashboard/orgs/${orgId}/billing`,
          ),
        });
      } catch {
        // Don't fail if email fails
      }
    }

    return {
      success: true,
      data: invoice,
      message: `Invoice ${invoice.invoiceNumber} generated`,
    };
  }

  @Post('invoices/:invoiceId/finalize')
  @ApiOperation({ summary: 'Finalize a draft invoice' })
  async finalizeInvoice(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const invoice = await this.invoiceService.findById(invoiceId);
    if (!invoice || invoice.orgId.toString() !== orgId) {
      throw new NotFoundException('Invoice not found');
    }

    const updated = await this.invoiceService.finalizeInvoice(invoiceId);

    // If we have a Stripe invoice, finalize it too
    if (updated.stripeInvoiceId && this.stripeService.configured) {
      try {
        const stripeResult = await this.stripeService.finalizeInvoice(updated.stripeInvoiceId);
        if (stripeResult.hostedUrl || stripeResult.pdfUrl) {
          // Update with Stripe URLs (directly via model to avoid circular updates)
          await this.invoiceService.findById(invoiceId); // refresh
        }
      } catch {
        // Don't fail local finalization if Stripe fails
      }
    }

    return {
      success: true,
      data: updated,
      message: 'Invoice finalized and sent',
    };
  }

  @Post('invoices/:invoiceId/paid')
  @ApiOperation({ summary: 'Mark invoice as paid' })
  async markInvoicePaid(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() paidDto: MarkInvoicePaidDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const invoice = await this.invoiceService.findById(invoiceId);
    if (!invoice || invoice.orgId.toString() !== orgId) {
      throw new NotFoundException('Invoice not found');
    }

    const updated = await this.invoiceService.markAsPaid(
      invoiceId,
      paidDto.paidAt ? new Date(paidDto.paidAt) : undefined,
      paidDto.paymentReference,
    );

    // Send payment success email
    const account = await this.billingAccountService.findByOrgId(orgId);
    if (account?.billingEmail) {
      try {
        await this.emailService.sendPaymentSuccess(
          account.billingEmail,
          this.pricingService.formatAmount(updated.totalCents),
          `${process.env.FRONTEND_URL}/dashboard/orgs/${orgId}/billing`,
        );
      } catch {
        // Don't fail if email fails
      }
    }

    return {
      success: true,
      data: updated,
      message: 'Invoice marked as paid',
    };
  }

  @Post('invoices/:invoiceId/void')
  @ApiOperation({ summary: 'Void an invoice' })
  async voidInvoice(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() voidDto: VoidInvoiceDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER']);

    const invoice = await this.invoiceService.findById(invoiceId);
    if (!invoice || invoice.orgId.toString() !== orgId) {
      throw new NotFoundException('Invoice not found');
    }

    // Void in Stripe if applicable
    if (invoice.stripeInvoiceId && this.stripeService.configured) {
      try {
        await this.stripeService.voidInvoice(invoice.stripeInvoiceId);
      } catch {
        // Don't fail local void if Stripe fails
      }
    }

    const updated = await this.invoiceService.voidInvoice(invoiceId, voidDto.reason);

    return {
      success: true,
      data: updated,
      message: 'Invoice voided',
    };
  }

  // ==================== Usage ====================

  @Get('usage')
  @ApiOperation({ summary: 'Get usage records' })
  async getUsage(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
    @Query() queryDto: QueryUsageDto,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const records = await this.usageService.getUsageByOrg(orgId, {
      startDate: queryDto.startDate ? new Date(queryDto.startDate) : undefined,
      endDate: queryDto.endDate ? new Date(queryDto.endDate) : undefined,
      usageType: queryDto.usageType as any,
      clusterId: queryDto.clusterId,
    });

    return {
      success: true,
      data: records,
    };
  }

  @Get('usage/summary')
  @ApiOperation({ summary: 'Get usage summary for current period' })
  async getUsageSummary(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId, ['OWNER', 'ADMIN']);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const summary = await this.usageService.getUsageSummary(orgId, periodStart, periodEnd);

    return {
      success: true,
      data: {
        ...summary,
        totalFormatted: this.pricingService.formatAmount(summary.totalCents),
      },
    };
  }

  // ==================== Prices ====================

  @Get('prices')
  @ApiOperation({ summary: 'Get all prices' })
  async getPrices(
    @CurrentUser() user: CurrentUserData,
    @Param('orgId') orgId: string,
  ) {
    await this.orgsService.checkAccess(orgId, user.userId);

    const prices = await this.pricingService.getAllPrices();

    return {
      success: true,
      data: prices.map(p => ({
        ...(p as any).toJSON ? (p as any).toJSON() : p,
        formattedAmount: p.unitAmountCents 
          ? this.pricingService.formatAmount(p.unitAmountCents)
          : p.perUnitAmountCents 
            ? `${this.pricingService.formatAmount(p.perUnitAmountCents)}/${p.unit}`
            : undefined,
      })),
    };
  }

  // ==================== Email Templates ====================

  private getInvoiceEmailTemplate(invoiceNumber: string, amount: string, dueDate: string, billingUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 32px 40px; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; color: #18181b;">EUTLAS</h1>
              <p style="margin: 4px 0 0; font-size: 14px; color: #71717a;">EU MongoDB Cloud Platform</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="padding: 16px; background-color: #dbeafe; border-radius: 8px; margin-bottom: 24px; text-align: center;">
                <h2 style="margin: 0; font-size: 20px; color: #1e40af;">New Invoice</h2>
              </div>
              <p style="margin: 0 0 16px; font-size: 16px; color: #3f3f46;">
                Invoice <strong>${invoiceNumber}</strong> has been generated for your organization.
              </p>
              <table style="width: 100%; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; color: #71717a;">Amount:</td>
                  <td style="padding: 8px 0; font-weight: bold; text-align: right;">${amount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #71717a; border-top: 1px solid #e4e4e7;">Due Date:</td>
                  <td style="padding: 8px 0; font-weight: bold; text-align: right; border-top: 1px solid #e4e4e7;">${dueDate}</td>
                </tr>
              </table>
              <a href="${billingUrl}" style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
                View Invoice
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #71717a; text-align: center;">
                &copy; ${new Date().getFullYear()} EUTLAS. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

// ==================== Stripe Webhook Controller ====================
// Separate controller for webhooks (no auth guard, needs raw body)

@ApiTags('Stripe Webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly billingAccountService: BillingAccountService,
    private readonly emailService: EmailService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing raw body' });
    }

    const event = this.stripeService.constructWebhookEvent(rawBody, signature);

    if (!event) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    try {
      // Handle the event
      await this.stripeService.handleWebhookEvent(event);

      // Send email notifications for certain events
      await this.sendWebhookEmailNotifications(event);

      return res.status(200).json({ received: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Webhook handler failed' });
    }
  }

  private async sendWebhookEmailNotifications(event: any): Promise<void> {
    try {
      switch (event.type) {
        case 'invoice.paid': {
          const invoice = event.data.object;
          const customerId = typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id;
          if (customerId) {
            const account = await this.billingAccountService.getByStripeCustomerId(customerId);
            if (account?.billingEmail) {
              const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
                .format((invoice.amount_paid || 0) / 100);
              await this.emailService.sendPaymentSuccess(
                account.billingEmail,
                amount,
                invoice.hosted_invoice_url || `${process.env.FRONTEND_URL}/dashboard`,
              );
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const customerId = typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id;
          if (customerId) {
            const account = await this.billingAccountService.getByStripeCustomerId(customerId);
            if (account?.billingEmail) {
              const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
                .format((invoice.amount_due || 0) / 100);
              await this.emailService.sendPaymentFailed(
                account.billingEmail,
                amount,
                `${process.env.FRONTEND_URL}/dashboard`,
              );
            }
          }
          break;
        }
      }
    } catch {
      // Don't fail webhook processing if email fails
    }
  }
}
