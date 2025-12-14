import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyScope = 
  | 'clusters:read'
  | 'clusters:write'
  | 'projects:read'
  | 'projects:write'
  | 'backups:read'
  | 'backups:write'
  | 'metrics:read'
  | 'members:read'
  | 'members:write'
  | 'admin';

export type ApiKeyDocument = ApiKey & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.keyHash; // Never expose the key hash
      return ret;
    },
  },
})
export class ApiKey {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, unique: true })
  publicKey: string; // Visible part: "eutlas_pk_..."

  @Prop({ required: true })
  keyHash: string; // Hashed secret key

  @Prop({ type: [String], default: ['clusters:read', 'projects:read'] })
  scopes: ApiKeyScope[];

  @Prop({ type: [String], default: [] })
  allowedIps: string[]; // Optional IP whitelist

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  expiresAt?: Date;

  @Prop()
  lastUsedAt?: Date;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

// Indexes
ApiKeySchema.index({ orgId: 1 });
ApiKeySchema.index({ publicKey: 1 }, { unique: true });
ApiKeySchema.index({ isActive: 1 });




