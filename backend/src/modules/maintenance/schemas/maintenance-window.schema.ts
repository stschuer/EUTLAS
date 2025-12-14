import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MaintenanceWindowDocument = MaintenanceWindow & Document;

export type MaintenanceWindowType = 'scheduled' | 'emergency';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

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
export class MaintenanceWindow {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['scheduled', 'emergency'],
    default: 'scheduled',
  })
  type: MaintenanceWindowType;

  @Prop({
    required: true,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'failed'],
    default: 'scheduled',
  })
  status: MaintenanceStatus;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  // Schedule settings
  @Prop({
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true,
  })
  dayOfWeek: DayOfWeek;

  @Prop({ required: true, min: 0, max: 23 })
  startHour: number;

  @Prop({ required: true, min: 1, max: 8 })
  durationHours: number;

  @Prop({ default: 'UTC' })
  timezone: string;

  // Auto-defer settings
  @Prop({ default: false })
  autoDeferEnabled: boolean;

  @Prop({ default: 7 })
  maxDeferDays: number;

  @Prop({ default: 0 })
  currentDeferCount: number;

  // Specific maintenance details
  @Prop()
  scheduledStartTime?: Date;

  @Prop()
  scheduledEndTime?: Date;

  @Prop()
  actualStartTime?: Date;

  @Prop()
  actualEndTime?: Date;

  @Prop({ type: [String] })
  affectedComponents?: string[];

  @Prop({ type: [String] })
  operationsPerformed?: string[];

  @Prop()
  notificationSentAt?: Date;

  @Prop({ default: false })
  requiresDowntime: boolean;

  @Prop()
  estimatedDowntimeMinutes?: number;

  @Prop()
  actualDowntimeMinutes?: number;

  @Prop()
  failureReason?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MaintenanceWindowSchema = SchemaFactory.createForClass(MaintenanceWindow);

// Indexes
MaintenanceWindowSchema.index({ clusterId: 1, status: 1, scheduledStartTime: 1 });
MaintenanceWindowSchema.index({ orgId: 1, status: 1 });
MaintenanceWindowSchema.index({ scheduledStartTime: 1, status: 1 });




