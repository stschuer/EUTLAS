import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChannelType = 'email' | 'webhook' | 'slack';

export type NotificationChannelDocument = NotificationChannel & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      // Don't expose secrets
      if (ret.config?.webhookSecret) {
        ret.config.webhookSecret = '***';
      }
      if (ret.config?.slackToken) {
        ret.config.slackToken = '***';
      }
      return ret;
    },
  },
})
export class NotificationChannel {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['email', 'webhook', 'slack'] })
  type: ChannelType;

  @Prop({ type: Object, required: true })
  config: {
    // Email
    emails?: string[];
    
    // Webhook
    webhookUrl?: string;
    webhookSecret?: string;
    webhookHeaders?: Record<string, string>;
    
    // Slack
    slackWebhookUrl?: string;
    slackChannel?: string;
  };

  @Prop({ default: true })
  enabled: boolean;

  @Prop()
  lastUsedAt?: Date;

  @Prop({ default: 0 })
  failureCount: number;

  @Prop()
  lastError?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const NotificationChannelSchema = SchemaFactory.createForClass(NotificationChannel);

// Indexes
NotificationChannelSchema.index({ orgId: 1 });
NotificationChannelSchema.index({ type: 1 });





