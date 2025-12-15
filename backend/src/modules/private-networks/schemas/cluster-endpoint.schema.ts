import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClusterEndpointDocument = ClusterEndpoint & Document;

export type EndpointType = 'public' | 'private' | 'both';

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
export class ClusterEndpoint {
  id: string;

  @Prop({ type: Types.ObjectId, ref: 'Cluster', required: true, unique: true })
  clusterId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PrivateNetwork' })
  privateNetworkId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['public', 'private', 'both'],
    default: 'public',
  })
  endpointType: EndpointType;

  // Public endpoint
  @Prop()
  publicHostname?: string;

  @Prop()
  publicPort?: number;

  @Prop({ default: true })
  publicEndpointEnabled: boolean;

  // Private endpoint
  @Prop()
  privateIpAddress?: string;

  @Prop()
  privateHostname?: string;

  @Prop()
  privatePort?: number;

  @Prop({ default: false })
  privateEndpointEnabled: boolean;

  // SRV records
  @Prop()
  publicSrvRecord?: string;

  @Prop()
  privateSrvRecord?: string;

  // TLS settings
  @Prop({ default: true })
  tlsEnabled: boolean;

  @Prop({ default: 'TLS1.2' })
  minTlsVersion: 'TLS1.0' | 'TLS1.1' | 'TLS1.2' | 'TLS1.3';

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ClusterEndpointSchema = SchemaFactory.createForClass(ClusterEndpoint);





