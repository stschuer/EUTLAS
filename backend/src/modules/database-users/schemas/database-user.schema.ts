import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * MongoDB Database User Roles
 * These map to MongoDB's built-in roles
 */
export type DatabaseRole =
  | 'read'
  | 'readWrite'
  | 'dbAdmin'
  | 'dbOwner'
  | 'userAdmin'
  | 'clusterAdmin'
  | 'readAnyDatabase'
  | 'readWriteAnyDatabase'
  | 'userAdminAnyDatabase'
  | 'dbAdminAnyDatabase'
  | 'root';

export interface DatabaseRoleAssignment {
  role: DatabaseRole;
  db: string; // Database name, 'admin' for cluster-wide roles
}

export type DatabaseUserDocument = DatabaseUser & Document;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash; // Never expose password hash
      return ret;
    },
  },
})
export class DatabaseUser {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string; // Encrypted password for MongoDB auth

  @Prop({ required: true, default: 'admin' })
  authenticationDatabase: string;

  @Prop({ type: [{ role: String, db: String }], required: true })
  roles: DatabaseRoleAssignment[];

  @Prop({ type: [String], default: [] })
  scopes: string[]; // Optional: restrict to specific databases

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastUsedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const DatabaseUserSchema = SchemaFactory.createForClass(DatabaseUser);

// Indexes
DatabaseUserSchema.index({ clusterId: 1, username: 1 }, { unique: true });
DatabaseUserSchema.index({ clusterId: 1 });
DatabaseUserSchema.index({ projectId: 1 });




