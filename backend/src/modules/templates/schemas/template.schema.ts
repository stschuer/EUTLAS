import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TemplateDocument = Template & Document;

export enum TemplateType {
  DASHBOARD = 'dashboard',
  SCHEMA = 'schema',
  DOCUMENT = 'document', // PPT, DOCX, etc.
  REPORT = 'report',
}

export enum TemplateCategory {
  MONITORING = 'monitoring',
  ANALYTICS = 'analytics',
  VALIDATION = 'validation',
  DOCUMENTATION = 'documentation',
  PRESENTATION = 'presentation',
  COMPLIANCE = 'compliance',
  CUSTOM = 'custom',
}

export enum TemplateVisibility {
  GLOBAL = 'global', // Available to all tenants
  TENANT = 'tenant', // Specific to one tenant
  PRIVATE = 'private', // Only creator can see
}

@Schema({ timestamps: true })
export class Template {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, enum: TemplateType })
  type: TemplateType;

  @Prop({ required: true, enum: TemplateCategory })
  category: TemplateCategory;

  @Prop({ required: true, enum: TemplateVisibility, default: TemplateVisibility.GLOBAL })
  visibility: TemplateVisibility;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  tenantId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  // For JSON-based templates (dashboard, schema, etc.)
  @Prop({ type: Object })
  content?: Record<string, any>;

  // For file-based templates (PPT, DOCX, etc.)
  @Prop()
  fileUrl?: string;

  @Prop()
  fileName?: string;

  @Prop()
  fileSize?: number;

  @Prop()
  mimeType?: string;

  // Metadata
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ default: false })
  isSystem: boolean; // System templates can't be deleted

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 0 })
  usageCount: number;

  @Prop()
  previewUrl?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  // Versioning
  @Prop({ default: 1 })
  version: number;

  @Prop({ type: Types.ObjectId, ref: 'Template' })
  previousVersion?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);

// Indexes
TemplateSchema.index({ type: 1, category: 1 });
TemplateSchema.index({ visibility: 1, isActive: 1 });
TemplateSchema.index({ tenantId: 1, isActive: 1 });
TemplateSchema.index({ tags: 1 });
TemplateSchema.index({ name: 'text', description: 'text', tags: 'text' });
