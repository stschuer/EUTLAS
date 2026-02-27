import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ImpersonationLogDocument = ImpersonationLog & Document;

@Schema({
  timestamps: true,
  collection: 'impersonationlogs',
})
export class ImpersonationLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  adminUserId: Types.ObjectId;

  @Prop({ required: true })
  adminEmail: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  impersonatedUserId: Types.ObjectId;

  @Prop({ required: true })
  impersonatedEmail: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  clientIp?: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ImpersonationLogSchema = SchemaFactory.createForClass(ImpersonationLog);

// Indexes for efficient querying
ImpersonationLogSchema.index({ adminUserId: 1, createdAt: -1 });
ImpersonationLogSchema.index({ impersonatedUserId: 1, createdAt: -1 });
ImpersonationLogSchema.index({ isActive: 1 });
