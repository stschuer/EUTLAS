import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PriceDocument = Price & Document;

export type PricingModel = 'flat' | 'per_unit' | 'tiered' | 'volume';

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
export class Price {
  id: string;

  @Prop({ required: true, unique: true })
  priceCode: string; // e.g., 'plan_dev', 'storage_gb', 'transfer_gb'

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: ['plan', 'usage', 'addon'] })
  category: 'plan' | 'usage' | 'addon';

  @Prop({ required: true, enum: ['flat', 'per_unit', 'tiered', 'volume'], default: 'flat' })
  pricingModel: PricingModel;

  @Prop({ required: true, default: 'EUR' })
  currency: string;

  // For flat pricing (plans)
  @Prop()
  unitAmountCents?: number;

  // For per-unit pricing
  @Prop()
  perUnitAmountCents?: number;

  @Prop()
  unit?: string; // 'hour', 'gb', 'gb-hour', 'request'

  // For tiered pricing
  @Prop({ type: [Object] })
  tiers?: {
    upTo: number | null; // null = infinity
    unitAmountCents: number;
    flatAmountCents?: number;
  }[];

  // Included amounts (e.g., storage included in plan)
  @Prop({ default: 0 })
  includedQuantity: number;

  // Billing interval
  @Prop({ enum: ['one_time', 'monthly', 'annual'], default: 'monthly' })
  interval: 'one_time' | 'monthly' | 'annual';

  // Stripe preparation
  @Prop()
  stripePriceId?: string;

  @Prop()
  stripeProductId?: string;

  @Prop({ default: true })
  active: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PriceSchema = SchemaFactory.createForClass(Price);

// Indexes
PriceSchema.index({ priceCode: 1 });
PriceSchema.index({ category: 1, active: 1 });




