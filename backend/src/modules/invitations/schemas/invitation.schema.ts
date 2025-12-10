import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OrgRole } from '../../orgs/schemas/org-member.schema';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type InvitationDocument = Invitation & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.token; // Never expose the token in API responses
      return ret;
    },
  },
})
export class Invitation {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, enum: ['OWNER', 'ADMIN', 'MEMBER', 'READONLY'], default: 'MEMBER' })
  role: OrgRole;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ required: true, enum: ['pending', 'accepted', 'expired', 'revoked'], default: 'pending' })
  status: InvitationStatus;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  acceptedBy?: Types.ObjectId;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  message?: string; // Optional personal message from inviter

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation);

// Indexes
InvitationSchema.index({ orgId: 1, email: 1 });
InvitationSchema.index({ token: 1 }, { unique: true });
InvitationSchema.index({ email: 1, status: 1 });
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-cleanup


