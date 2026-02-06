import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillingAccount, BillingAccountDocument } from '../schemas/billing-account.schema';
import { Invoice, InvoiceDocument } from '../schemas/invoice.schema';

export interface StripeCustomerData {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface StripePaymentMethodData {
  type: 'card' | 'sepa_debit';
  card?: {
    number: string;
    exp_month: number;
    exp_year: number;
    cvc: string;
  };
}

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;
  private isConfigured = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(BillingAccount.name) private billingAccountModel: Model<BillingAccountDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2025-01-27.acacia' as any });
      this.isConfigured = true;
      this.logger.log('Stripe integration configured');
    } else {
      this.logger.warn('Stripe not configured - STRIPE_SECRET_KEY not set');
    }
  }

  async onModuleInit() {
    if (this.isConfigured) {
      this.logger.log('Stripe service initialized');
    }
  }

  get configured(): boolean {
    return this.isConfigured;
  }

  getStripe(): Stripe | null {
    return this.stripe;
  }

  // ==================== Customers ====================

  async createCustomer(data: StripeCustomerData): Promise<string | null> {
    if (!this.stripe) {
      this.logger.warn('Stripe not configured - skipping createCustomer');
      return null;
    }

    try {
      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        metadata: data.metadata,
      });
      this.logger.log(`Created Stripe customer ${customer.id} for ${data.email}`);
      return customer.id;
    } catch (error: any) {
      this.logger.error(`Failed to create Stripe customer: ${error.message}`);
      throw error;
    }
  }

  async updateCustomer(customerId: string, data: Partial<StripeCustomerData>): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.customers.update(customerId, {
        email: data.email,
        name: data.name,
        metadata: data.metadata,
      });
      this.logger.log(`Updated Stripe customer ${customerId}`);
    } catch (error: any) {
      this.logger.error(`Failed to update Stripe customer: ${error.message}`);
      throw error;
    }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.customers.del(customerId);
      this.logger.log(`Deleted Stripe customer ${customerId}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete Stripe customer: ${error.message}`);
      throw error;
    }
  }

  // ==================== Payment Methods ====================

  async createSetupIntent(customerId: string): Promise<{ clientSecret: string; id: string } | null> {
    if (!this.stripe) return null;

    try {
      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card', 'sepa_debit'],
      });
      this.logger.log(`Created setup intent ${setupIntent.id} for customer ${customerId}`);
      return {
        clientSecret: setupIntent.client_secret!,
        id: setupIntent.id,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create setup intent: ${error.message}`);
      throw error;
    }
  }

  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      this.logger.log(`Attached payment method ${paymentMethodId} to customer ${customerId}`);
    } catch (error: any) {
      this.logger.error(`Failed to attach payment method: ${error.message}`);
      throw error;
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);
      this.logger.log(`Detached payment method ${paymentMethodId}`);
    } catch (error: any) {
      this.logger.error(`Failed to detach payment method: ${error.message}`);
      throw error;
    }
  }

  async getPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod | null> {
    if (!this.stripe) return null;

    try {
      return await this.stripe.paymentMethods.retrieve(paymentMethodId);
    } catch (error: any) {
      this.logger.error(`Failed to get payment method: ${error.message}`);
      return null;
    }
  }

  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    if (!this.stripe) return [];

    try {
      const methods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      return methods.data;
    } catch (error: any) {
      this.logger.error(`Failed to list payment methods: ${error.message}`);
      return [];
    }
  }

  // ==================== Products & Prices ====================

  async createProduct(data: {
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Product | null> {
    if (!this.stripe) return null;

    try {
      const product = await this.stripe.products.create({
        name: data.name,
        description: data.description,
        metadata: data.metadata,
      });
      this.logger.log(`Created Stripe product ${product.id}: ${data.name}`);
      return product;
    } catch (error: any) {
      this.logger.error(`Failed to create Stripe product: ${error.message}`);
      throw error;
    }
  }

  async createPrice(data: {
    productId: string;
    unitAmountCents: number;
    currency?: string;
    recurring?: { interval: 'month' | 'year' };
    metadata?: Record<string, string>;
  }): Promise<Stripe.Price | null> {
    if (!this.stripe) return null;

    try {
      const priceData: Stripe.PriceCreateParams = {
        product: data.productId,
        unit_amount: data.unitAmountCents,
        currency: (data.currency || 'eur').toLowerCase(),
        metadata: data.metadata,
      };

      if (data.recurring) {
        priceData.recurring = { interval: data.recurring.interval };
      }

      const price = await this.stripe.prices.create(priceData);
      this.logger.log(`Created Stripe price ${price.id}: ${data.unitAmountCents} cents`);
      return price;
    } catch (error: any) {
      this.logger.error(`Failed to create Stripe price: ${error.message}`);
      throw error;
    }
  }

  async listProducts(): Promise<Stripe.Product[]> {
    if (!this.stripe) return [];

    try {
      const products = await this.stripe.products.list({ limit: 100, active: true });
      return products.data;
    } catch (error: any) {
      this.logger.error(`Failed to list Stripe products: ${error.message}`);
      return [];
    }
  }

  // ==================== Invoices ====================

  async createInvoice(customerId: string, items: { description: string; amount: number }[]): Promise<string | null> {
    if (!this.stripe) {
      this.logger.warn('Stripe not configured - skipping createInvoice');
      return null;
    }

    try {
      // Create invoice items
      for (const item of items) {
        await this.stripe.invoiceItems.create({
          customer: customerId,
          amount: item.amount,
          currency: 'eur',
          description: item.description,
        });
      }

      // Create the invoice
      const invoice = await this.stripe.invoices.create({
        customer: customerId,
        auto_advance: true,
      });

      this.logger.log(`Created Stripe invoice ${invoice.id} for customer ${customerId}`);
      return invoice.id;
    } catch (error: any) {
      this.logger.error(`Failed to create Stripe invoice: ${error.message}`);
      throw error;
    }
  }

  async finalizeInvoice(invoiceId: string): Promise<{ hostedUrl?: string; pdfUrl?: string }> {
    if (!this.stripe) return {};

    try {
      const invoice = await this.stripe.invoices.finalizeInvoice(invoiceId);
      return {
        hostedUrl: invoice.hosted_invoice_url || undefined,
        pdfUrl: invoice.invoice_pdf || undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to finalize Stripe invoice: ${error.message}`);
      throw error;
    }
  }

  async payInvoice(invoiceId: string): Promise<boolean> {
    if (!this.stripe) return true;

    try {
      const invoice = await this.stripe.invoices.pay(invoiceId);
      return invoice.status === 'paid';
    } catch (error: any) {
      this.logger.error(`Failed to pay Stripe invoice: ${error.message}`);
      return false;
    }
  }

  async voidInvoice(invoiceId: string): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.invoices.voidInvoice(invoiceId);
      this.logger.log(`Voided Stripe invoice ${invoiceId}`);
    } catch (error: any) {
      this.logger.error(`Failed to void Stripe invoice: ${error.message}`);
      throw error;
    }
  }

  // ==================== Payment Intents ====================

  async createPaymentIntent(
    amount: number,
    currency: string,
    customerId: string,
    metadata?: Record<string, string>,
  ): Promise<{ clientSecret: string; id: string } | null> {
    if (!this.stripe) return null;

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency: currency.toLowerCase(),
        customer: customerId,
        metadata,
        automatic_payment_methods: { enabled: true },
      });

      this.logger.log(`Created payment intent ${paymentIntent.id} for ${amount} ${currency}`);
      return {
        clientSecret: paymentIntent.client_secret!,
        id: paymentIntent.id,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create payment intent: ${error.message}`);
      throw error;
    }
  }

  // ==================== Subscriptions ====================

  async createSubscription(
    customerId: string,
    priceId: string,
    metadata?: Record<string, string>,
  ): Promise<string | null> {
    if (!this.stripe) return null;

    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        metadata,
      });

      this.logger.log(`Created subscription ${subscription.id} for customer ${customerId}`);
      return subscription.id;
    } catch (error: any) {
      this.logger.error(`Failed to create subscription: ${error.message}`);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!this.stripe) return;

    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
      this.logger.log(`Cancelled subscription ${subscriptionId}`);
    } catch (error: any) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`);
      throw error;
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    if (!this.stripe) return null;

    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error: any) {
      this.logger.error(`Failed to get subscription: ${error.message}`);
      return null;
    }
  }

  // ==================== Customer Portal ====================

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<string | null> {
    if (!this.stripe) return null;

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session.url;
    } catch (error: any) {
      this.logger.error(`Failed to create billing portal session: ${error.message}`);
      throw error;
    }
  }

  // ==================== Webhooks ====================

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event | null {
    if (!this.stripe) return null;

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return null;
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error: any) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`);
      return null;
    }
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Handling webhook event: ${event.type}`);

    switch (event.type) {
      case 'invoice.paid': {
        const stripeInvoice = event.data.object as Stripe.Invoice;
        await this.handleInvoicePaid(stripeInvoice);
        break;
      }

      case 'invoice.payment_failed': {
        const stripeInvoice = event.data.object as Stripe.Invoice;
        await this.handleInvoicePaymentFailed(stripeInvoice);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionDeleted(subscription);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionUpdated(subscription);
        break;
      }

      case 'setup_intent.succeeded': {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        await this.handleSetupIntentSucceeded(setupIntent);
        break;
      }

      case 'payment_method.attached': {
        this.logger.log(`Payment method attached: ${(event.data.object as Stripe.PaymentMethod).id}`);
        break;
      }

      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  // ==================== Webhook Handlers ====================

  private async handleInvoicePaid(stripeInvoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice paid: ${stripeInvoice.id}`);

    // Update our local invoice if it exists
    const localInvoice = await this.invoiceModel.findOne({
      stripeInvoiceId: stripeInvoice.id,
    }).exec();

    if (localInvoice) {
      localInvoice.status = 'paid';
      localInvoice.paidAt = new Date();
      localInvoice.stripeHostedInvoiceUrl = stripeInvoice.hosted_invoice_url || undefined;
      localInvoice.stripePdfUrl = stripeInvoice.invoice_pdf || undefined;
      await localInvoice.save();
      this.logger.log(`Updated local invoice ${localInvoice.invoiceNumber} to paid`);
    }

    // Update billing account delinquent status
    if (stripeInvoice.customer) {
      const customerId = typeof stripeInvoice.customer === 'string'
        ? stripeInvoice.customer
        : stripeInvoice.customer.id;
      const account = await this.billingAccountModel.findOne({ stripeCustomerId: customerId }).exec();
      if (account) {
        account.delinquent = false;
        account.delinquentSince = undefined;
        await account.save();
      }
    }
  }

  private async handleInvoicePaymentFailed(stripeInvoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment failed: ${stripeInvoice.id}`);

    // Mark billing account as delinquent
    if (stripeInvoice.customer) {
      const customerId = typeof stripeInvoice.customer === 'string'
        ? stripeInvoice.customer
        : stripeInvoice.customer.id;
      const account = await this.billingAccountModel.findOne({ stripeCustomerId: customerId }).exec();
      if (account) {
        account.delinquent = true;
        if (!account.delinquentSince) {
          account.delinquentSince = new Date();
        }
        await account.save();
        this.logger.log(`Marked billing account ${account.id} as delinquent`);
      }
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);

    const account = await this.billingAccountModel.findOne({
      stripeSubscriptionId: subscription.id,
    }).exec();

    if (account) {
      account.stripeSubscriptionId = undefined;
      await account.save();
      this.logger.log(`Cleared subscription for billing account ${account.id}`);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id} - status: ${subscription.status}`);
  }

  private async handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent): Promise<void> {
    this.logger.log(`Setup intent succeeded: ${setupIntent.id}`);

    const customerId = typeof setupIntent.customer === 'string'
      ? setupIntent.customer
      : setupIntent.customer?.id;

    if (customerId && setupIntent.payment_method) {
      const paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method.id;

      // Set as default payment method
      if (this.stripe) {
        await this.stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }

      // Update local billing account
      const account = await this.billingAccountModel.findOne({ stripeCustomerId: customerId }).exec();
      if (account) {
        const pm = await this.getPaymentMethod(paymentMethodId);
        if (pm) {
          account.stripePaymentMethodId = paymentMethodId;
          account.paymentMethodType = pm.type === 'sepa_debit' ? 'sepa_debit' : 'card';
          account.paymentMethod = {
            type: pm.type,
            last4: pm.card?.last4 || pm.sepa_debit?.last4 || undefined,
            brand: pm.card?.brand || undefined,
            expiryMonth: pm.card?.exp_month,
            expiryYear: pm.card?.exp_year,
            bankName: pm.sepa_debit?.bank_code || undefined,
          };
          await account.save();
          this.logger.log(`Updated payment method for billing account ${account.id}`);
        }
      }
    }
  }
}
