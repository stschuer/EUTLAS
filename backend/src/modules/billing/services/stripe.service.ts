import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import Stripe from 'stripe'; // Uncomment when adding Stripe

/**
 * Stripe Integration Service
 * 
 * This service is prepared for Stripe integration. Currently, it contains
 * placeholder methods that will be implemented when Stripe is added.
 * 
 * To enable Stripe:
 * 1. Install Stripe: pnpm add stripe
 * 2. Add STRIPE_SECRET_KEY to env
 * 3. Add STRIPE_WEBHOOK_SECRET to env
 * 4. Uncomment the Stripe import and implementation
 */

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
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  // private stripe: Stripe;
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    
    if (stripeKey) {
      // this.stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
      this.isConfigured = true;
      this.logger.log('Stripe integration configured');
    } else {
      this.logger.warn('Stripe not configured - STRIPE_SECRET_KEY not set');
    }
  }

  get configured(): boolean {
    return this.isConfigured;
  }

  // ==================== Customers ====================

  async createCustomer(data: StripeCustomerData): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn('Stripe not configured - skipping createCustomer');
      return null;
    }

    // TODO: Implement when Stripe is added
    // const customer = await this.stripe.customers.create({
    //   email: data.email,
    //   name: data.name,
    //   metadata: data.metadata,
    // });
    // return customer.id;

    this.logger.log(`[MOCK] Created Stripe customer for ${data.email}`);
    return `cus_mock_${Date.now()}`;
  }

  async updateCustomer(customerId: string, data: Partial<StripeCustomerData>): Promise<void> {
    if (!this.isConfigured) return;

    // TODO: Implement when Stripe is added
    // await this.stripe.customers.update(customerId, data);
    
    this.logger.log(`[MOCK] Updated Stripe customer ${customerId}`);
  }

  async deleteCustomer(customerId: string): Promise<void> {
    if (!this.isConfigured) return;

    // TODO: Implement when Stripe is added
    // await this.stripe.customers.del(customerId);
    
    this.logger.log(`[MOCK] Deleted Stripe customer ${customerId}`);
  }

  // ==================== Payment Methods ====================

  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    if (!this.isConfigured) return;

    // TODO: Implement when Stripe is added
    // await this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    // await this.stripe.customers.update(customerId, {
    //   invoice_settings: { default_payment_method: paymentMethodId },
    // });

    this.logger.log(`[MOCK] Attached payment method ${paymentMethodId} to customer ${customerId}`);
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    if (!this.isConfigured) return;

    // TODO: Implement when Stripe is added
    // await this.stripe.paymentMethods.detach(paymentMethodId);

    this.logger.log(`[MOCK] Detached payment method ${paymentMethodId}`);
  }

  async getPaymentMethod(paymentMethodId: string): Promise<any | null> {
    if (!this.isConfigured) return null;

    // TODO: Implement when Stripe is added
    // return await this.stripe.paymentMethods.retrieve(paymentMethodId);

    return {
      id: paymentMethodId,
      type: 'card',
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2025 },
    };
  }

  // ==================== Invoices ====================

  async createInvoice(customerId: string, items: { description: string; amount: number }[]): Promise<string | null> {
    if (!this.isConfigured) {
      this.logger.warn('Stripe not configured - skipping createInvoice');
      return null;
    }

    // TODO: Implement when Stripe is added
    // for (const item of items) {
    //   await this.stripe.invoiceItems.create({
    //     customer: customerId,
    //     amount: item.amount,
    //     currency: 'eur',
    //     description: item.description,
    //   });
    // }
    // const invoice = await this.stripe.invoices.create({
    //   customer: customerId,
    //   auto_advance: true,
    // });
    // return invoice.id;

    this.logger.log(`[MOCK] Created Stripe invoice for customer ${customerId}`);
    return `in_mock_${Date.now()}`;
  }

  async finalizeInvoice(invoiceId: string): Promise<{ hostedUrl?: string; pdfUrl?: string }> {
    if (!this.isConfigured) return {};

    // TODO: Implement when Stripe is added
    // const invoice = await this.stripe.invoices.finalizeInvoice(invoiceId);
    // return {
    //   hostedUrl: invoice.hosted_invoice_url,
    //   pdfUrl: invoice.invoice_pdf,
    // };

    return {
      hostedUrl: `https://invoice.stripe.com/mock/${invoiceId}`,
      pdfUrl: `https://invoice.stripe.com/mock/${invoiceId}/pdf`,
    };
  }

  async payInvoice(invoiceId: string): Promise<boolean> {
    if (!this.isConfigured) return true;

    // TODO: Implement when Stripe is added
    // const invoice = await this.stripe.invoices.pay(invoiceId);
    // return invoice.paid;

    return true;
  }

  async voidInvoice(invoiceId: string): Promise<void> {
    if (!this.isConfigured) return;

    // TODO: Implement when Stripe is added
    // await this.stripe.invoices.voidInvoice(invoiceId);

    this.logger.log(`[MOCK] Voided Stripe invoice ${invoiceId}`);
  }

  // ==================== Payment Intents ====================

  async createPaymentIntent(
    amount: number,
    currency: string,
    customerId: string,
    metadata?: Record<string, string>,
  ): Promise<{ clientSecret: string; id: string } | null> {
    if (!this.isConfigured) return null;

    // TODO: Implement when Stripe is added
    // const paymentIntent = await this.stripe.paymentIntents.create({
    //   amount,
    //   currency,
    //   customer: customerId,
    //   metadata,
    //   automatic_payment_methods: { enabled: true },
    // });
    // return { clientSecret: paymentIntent.client_secret!, id: paymentIntent.id };

    return {
      clientSecret: `pi_mock_secret_${Date.now()}`,
      id: `pi_mock_${Date.now()}`,
    };
  }

  // ==================== Subscriptions ====================

  async createSubscription(
    customerId: string,
    priceId: string,
    metadata?: Record<string, string>,
  ): Promise<string | null> {
    if (!this.isConfigured) return null;

    // TODO: Implement when Stripe is added
    // const subscription = await this.stripe.subscriptions.create({
    //   customer: customerId,
    //   items: [{ price: priceId }],
    //   metadata,
    // });
    // return subscription.id;

    this.logger.log(`[MOCK] Created subscription for customer ${customerId}`);
    return `sub_mock_${Date.now()}`;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!this.isConfigured) return;

    // TODO: Implement when Stripe is added
    // await this.stripe.subscriptions.cancel(subscriptionId);

    this.logger.log(`[MOCK] Cancelled subscription ${subscriptionId}`);
  }

  // ==================== Webhooks ====================

  async constructWebhookEvent(payload: Buffer, signature: string): Promise<any | null> {
    if (!this.isConfigured) return null;

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return null;
    }

    // TODO: Implement when Stripe is added
    // return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    return null;
  }

  async handleWebhookEvent(event: any): Promise<void> {
    // TODO: Implement webhook handling when Stripe is added
    // switch (event.type) {
    //   case 'invoice.paid':
    //     // Handle paid invoice
    //     break;
    //   case 'invoice.payment_failed':
    //     // Handle failed payment
    //     break;
    //   case 'customer.subscription.deleted':
    //     // Handle cancelled subscription
    //     break;
    //   default:
    //     this.logger.log(`Unhandled webhook event: ${event.type}`);
    // }

    this.logger.log(`[MOCK] Handled webhook event: ${event?.type || 'unknown'}`);
  }
}


