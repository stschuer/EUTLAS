import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PrivateNetworkDocument = PrivateNetwork & Document;

export type NetworkStatus = 'pending' | 'creating' | 'active' | 'updating' | 'deleting' | 'failed';

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
export class PrivateNetwork {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({
    required: true,
    enum: ['pending', 'creating', 'active', 'updating', 'deleting', 'failed'],
    default: 'pending',
  })
  status: NetworkStatus;

  // Hetzner-specific configuration
  @Prop({ required: true })
  region: 'fsn1' | 'nbg1' | 'hel1'; // Falkenstein, Nuremberg, Helsinki

  @Prop({ required: true })
  ipRange: string; // e.g., "10.0.0.0/16"

  @Prop()
  hetznerNetworkId?: string; // Hetzner Cloud network ID

  @Prop({ type: [Object], default: [] })
  subnets: Array<{
    id: string;
    name: string;
    ipRange: string;
    zone: string;
    gateway?: string;
  }>;

  // Connected clusters
  @Prop({ type: [Types.ObjectId], ref: 'Cluster', default: [] })
  connectedClusters: Types.ObjectId[];

  // Peering connections
  @Prop({ type: [Object], default: [] })
  peeringConnections: Array<{
    id: string;
    name: string;
    status: 'pending' | 'active' | 'failed';
    peerNetworkId: string;
    peerIpRange: string;
    createdAt: Date;
  }>;

  // Routes
  @Prop({ type: [Object], default: [] })
  routes: Array<{
    destination: string;
    gateway: string;
  }>;

  // Labels for organization
  @Prop({ type: Map, of: String, default: {} })
  labels: Map<string, string>;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PrivateNetworkSchema = SchemaFactory.createForClass(PrivateNetwork);

PrivateNetworkSchema.index({ orgId: 1, projectId: 1 });
PrivateNetworkSchema.index({ region: 1, status: 1 });
PrivateNetworkSchema.index({ hetznerNetworkId: 1 }, { sparse: true });


