import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvoiceDocument = Invoice & Document;

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalCents: number;
  usageType?: string;
  clusterId?: string;
  clusterName?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Invoice {
  id: string;

  @Prop({ required: true, unique: true })
  invoiceNumber: string; // e.g., "INV-2024-0001"

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'BillingAccount', required: true })
  billingAccountId: Types.ObjectId;

  @Prop({ required: true, enum: ['draft', 'open', 'paid', 'void', 'uncollectible'], default: 'draft' })
  status: InvoiceStatus;

  @Prop({ required: true })
  currency: string; // 'EUR', 'USD'

  @Prop({ required: true })
  billingPeriodStart: Date;

  @Prop({ required: true })
  billingPeriodEnd: Date;

  @Prop({ type: [Object], default: [] })
  lineItems: InvoiceLineItem[];

  @Prop({ required: true, default: 0 })
  subtotalCents: number;

  @Prop({ default: 0 })
  discountCents: number;

  @Prop()
  discountDescription?: string;

  @Prop({ default: 0 })
  taxPercent: number; // e.g., 19 for 19% VAT

  @Prop({ default: 0 })
  taxCents: number;

  @Prop({ required: true, default: 0 })
  totalCents: number;

  @Prop()
  dueDate: Date;

  @Prop()
  paidAt?: Date;

  @Prop()
  voidedAt?: Date;

  @Prop()
  voidReason?: string;

  // Billing details snapshot (in case they change later)
  @Prop({ type: Object })
  billingDetails: {
    companyName?: string;
    name: string;
    email: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    vatId?: string;
  };

  // Stripe integration fields (prepared for later)
  @Prop()
  stripeInvoiceId?: string;

  @Prop()
  stripePaymentIntentId?: string;

  @Prop()
  stripeHostedInvoiceUrl?: string;

  @Prop()
  stripePdfUrl?: string;

  @Prop()
  notes?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// Indexes
InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ orgId: 1, status: 1 });
InvoiceSchema.index({ billingPeriodStart: 1, billingPeriodEnd: 1 });
InvoiceSchema.index({ status: 1, dueDate: 1 });
InvoiceSchema.index({ stripeInvoiceId: 1 });


