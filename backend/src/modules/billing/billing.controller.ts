import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { BillingAccountService } from './services/billing-account.service';
import { InvoiceService } from './services/invoice.service';
import { UsageService } from './services/usage.service';
import { PricingService } from './services/pricing.service';
import { OrgsService } from '../orgs/orgs.service';
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
    private readonly orgsService: OrgsService,
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
}

