import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CollectionSchemaDocument = CollectionSchema & Document;

export type ValidationLevel = 'off' | 'strict' | 'moderate';
export type ValidationAction = 'error' | 'warn';

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
export class CollectionSchema {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ required: true })
  database: string;

  @Prop({ required: true })
  collection: string;

  @Prop({ type: Object, default: {} })
  jsonSchema: Record<string, any>;

  @Prop({
    type: String,
    enum: ['off', 'strict', 'moderate'],
    default: 'strict',
  })
  validationLevel: ValidationLevel;

  @Prop({
    type: String,
    enum: ['error', 'warn'],
    default: 'error',
  })
  validationAction: ValidationAction;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  description?: string;

  // Schema history for versioning
  @Prop({ type: [Object], default: [] })
  history: Array<{
    version: number;
    schema: Record<string, any>;
    changedAt: Date;
    changedBy: string;
    comment?: string;
  }>;

  @Prop({ default: 1 })
  currentVersion: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CollectionSchemaSchema = SchemaFactory.createForClass(CollectionSchema);

CollectionSchemaSchema.index({ clusterId: 1, database: 1, collection: 1 }, { unique: true });


