import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DashboardDocument = Dashboard & Document;

export type WidgetType = 
  | 'line_chart' 
  | 'area_chart' 
  | 'bar_chart' 
  | 'gauge' 
  | 'stat' 
  | 'table' 
  | 'heatmap'
  | 'pie_chart';

export type MetricSource = 
  | 'cpu_percent'
  | 'memory_percent'
  | 'storage_percent'
  | 'connections'
  | 'operations_per_sec'
  | 'network_in'
  | 'network_out'
  | 'query_time_avg'
  | 'replication_lag'
  | 'custom';

@Schema({ _id: false })
export class DashboardWidget {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({
    required: true,
    enum: ['line_chart', 'area_chart', 'bar_chart', 'gauge', 'stat', 'table', 'heatmap', 'pie_chart'],
  })
  type: WidgetType;

  @Prop({ type: [String], default: [] })
  metrics: string[];

  @Prop({ type: Object })
  query?: {
    metric: MetricSource;
    aggregation?: 'avg' | 'sum' | 'max' | 'min' | 'count';
    groupBy?: string;
  };

  @Prop({ type: Object })
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  @Prop({ type: Object })
  options?: {
    color?: string;
    thresholds?: Array<{ value: number; color: string }>;
    unit?: string;
    decimals?: number;
    showLegend?: boolean;
    stacked?: boolean;
  };

  @Prop()
  description?: string;
}

export const DashboardWidgetSchema = SchemaFactory.createForClass(DashboardWidget);

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
export class Dashboard {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cluster' })
  clusterId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: [DashboardWidgetSchema], default: [] })
  widgets: DashboardWidget[];

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: false })
  isShared: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({
    type: String,
    enum: ['private', 'org', 'public'],
    default: 'private',
  })
  visibility: 'private' | 'org' | 'public';

  @Prop({ type: Object })
  layout?: {
    columns: number;
    rowHeight: number;
  };

  @Prop({ type: Object })
  timeRange?: {
    from: string;
    to: string;
    refresh?: number;
  };

  @Prop({ type: Map, of: String })
  variables?: Map<string, string>;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const DashboardSchema = SchemaFactory.createForClass(Dashboard);

DashboardSchema.index({ orgId: 1, createdBy: 1 });
DashboardSchema.index({ clusterId: 1 });
DashboardSchema.index({ visibility: 1 });





