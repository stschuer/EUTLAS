import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrivateNetworksController, ClusterEndpointController } from './private-networks.controller';
import { PrivateNetworksService } from './private-networks.service';
import { PrivateNetwork, PrivateNetworkSchema } from './schemas/private-network.schema';
import { ClusterEndpoint, ClusterEndpointSchema } from './schemas/cluster-endpoint.schema';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PrivateNetwork.name, schema: PrivateNetworkSchema },
      { name: ClusterEndpoint.name, schema: ClusterEndpointSchema },
    ]),
    EventsModule,
    AuditModule,
  ],
  controllers: [PrivateNetworksController, ClusterEndpointController],
  providers: [PrivateNetworksService],
  exports: [PrivateNetworksService],
})
export class PrivateNetworksModule {}

