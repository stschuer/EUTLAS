import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DataSubjectRequestType =
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'portability'
  | 'restriction'
  | 'objection';

export type DataSubjectRequestStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'rejected';

export type GdprRequestDocument = GdprRequest & Document;

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
export class GdprRequest {
  id: string;

  @Prop({
    required: true,
    enum: ['access', 'rectification', 'erasure', 'portability', 'restriction', 'objection'],
  })
  type: DataSubjectRequestType;

  @Prop({
    required: true,
    enum: ['pending', 'in_progress', 'completed', 'rejected'],
    default: 'pending',
  })
  status: DataSubjectRequestStatus;

  @Prop({ required: true, trim: true, lowercase: true })
  requestorEmail: string;

  @Prop({ required: true, trim: true })
  requestorName: string;

  @Prop({ required: true, trim: true, lowercase: true })
  subjectEmail: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop()
  response?: string;

  @Prop()
  dataExport?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  processedBy?: Types.ObjectId;

  @Prop()
  processedAt?: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const GdprRequestSchema = SchemaFactory.createForClass(GdprRequest);

GdprRequestSchema.index({ orgId: 1, createdAt: -1 });
GdprRequestSchema.index({ status: 1, dueDate: 1 });
GdprRequestSchema.index({ subjectEmail: 1 });
