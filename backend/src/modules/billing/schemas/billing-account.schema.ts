import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BillingAccountDocument = BillingAccount & Document;

export type PaymentMethodType = 'card' | 'sepa_debit' | 'invoice' | 'none';

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      // Mask sensitive data
      if (ret.paymentMethod?.last4) {
        ret.paymentMethod.last4 = ret.paymentMethod.last4;
      }
      return ret;
    },
  },
})
export class BillingAccount {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, unique: true })
  orgId: Types.ObjectId;

  // Company / Billing info
  @Prop()
  companyName?: string;

  @Prop({ required: true })
  billingEmail: string;

  @Prop()
  billingName?: string;

  @Prop({ type: Object })
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string; // ISO 3166-1 alpha-2
  };

  @Prop()
  vatId?: string;

  @Prop({ default: 'EUR' })
  currency: string;

  @Prop({ default: 19 })
  taxPercent: number; // Default VAT for EU

  // Payment method info
  @Prop({ enum: ['card', 'sepa_debit', 'invoice', 'none'], default: 'none' })
  paymentMethodType: PaymentMethodType;

  @Prop({ type: Object })
  paymentMethod?: {
    type: string;
    last4?: string;
    brand?: string; // 'visa', 'mastercard', etc.
    expiryMonth?: number;
    expiryYear?: number;
    bankName?: string; // For SEPA
  };

  // Stripe integration (prepared for later)
  @Prop()
  stripeCustomerId?: string;

  @Prop()
  stripePaymentMethodId?: string;

  @Prop()
  stripeSubscriptionId?: string;

  // Billing settings
  @Prop({ default: 'monthly', enum: ['monthly', 'annual'] })
  billingCycle: 'monthly' | 'annual';

  @Prop({ default: 1 })
  billingDay: number; // Day of month for billing (1-28)

  @Prop({ default: 14 })
  paymentTermDays: number; // Net 14, Net 30, etc.

  // Account status
  @Prop({ default: true })
  active: boolean;

  @Prop({ default: false })
  delinquent: boolean; // Has overdue invoices

  @Prop()
  delinquentSince?: Date;

  // Credits / Balance
  @Prop({ default: 0 })
  creditBalanceCents: number; // Prepaid credits

  @Prop({ default: 0 })
  currentPeriodUsageCents: number; // Running total for current period

  // Free Trial
  @Prop({ default: false })
  isTrialActive: boolean;

  @Prop()
  trialStartDate?: Date;

  @Prop()
  trialEndDate?: Date;

  @Prop({ default: 14 })
  trialDurationDays: number;

  @Prop({ default: 'MEDIUM' })
  trialPlan: string; // Plan available during trial

  @Prop({ default: false })
  trialExpired: boolean;

  @Prop({ default: false })
  trialConverted: boolean; // Whether trial converted to paid

  // Annual billing discount
  @Prop({ default: 20 })
  annualDiscountPercent: number; // 20% discount for annual billing

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const BillingAccountSchema = SchemaFactory.createForClass(BillingAccount);

// Indexes
BillingAccountSchema.index({ orgId: 1 });
BillingAccountSchema.index({ stripeCustomerId: 1 });
BillingAccountSchema.index({ delinquent: 1 });





