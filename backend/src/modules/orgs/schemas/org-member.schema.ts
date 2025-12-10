import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'READONLY';

export type OrgMemberDocument = OrgMember & Document;

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
export class OrgMember {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['OWNER', 'ADMIN', 'MEMBER', 'READONLY'] })
  role: OrgRole;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const OrgMemberSchema = SchemaFactory.createForClass(OrgMember);

// Indexes
OrgMemberSchema.index({ orgId: 1, userId: 1 }, { unique: true });
OrgMemberSchema.index({ userId: 1 });
