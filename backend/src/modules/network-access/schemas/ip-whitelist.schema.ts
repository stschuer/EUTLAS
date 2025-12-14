import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IpWhitelistEntryDocument = IpWhitelistEntry & Document;

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
export class IpWhitelistEntry {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true })
  cidrBlock: string; // e.g., "192.168.1.0/24" or "0.0.0.0/0"

  @Prop({ trim: true })
  comment?: string; // e.g., "Office Network", "Developer Home"

  @Prop({ default: false })
  isTemporary: boolean;

  @Prop()
  expiresAt?: Date; // For temporary access

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const IpWhitelistEntrySchema = SchemaFactory.createForClass(IpWhitelistEntry);

// Indexes
IpWhitelistEntrySchema.index({ clusterId: 1, cidrBlock: 1 }, { unique: true });
IpWhitelistEntrySchema.index({ clusterId: 1 });
IpWhitelistEntrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for temporary entries




