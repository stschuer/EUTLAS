import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NetworkAccessController } from './network-access.controller';
import { NetworkAccessService } from './network-access.service';
import { IpWhitelistEntry, IpWhitelistEntrySchema } from './schemas/ip-whitelist.schema';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IpWhitelistEntry.name, schema: IpWhitelistEntrySchema },
    ]),
    forwardRef(() => ClustersModule),
    ProjectsModule,
    OrgsModule,
    KubernetesModule,
    EventsModule,
  ],
  controllers: [NetworkAccessController],
  providers: [NetworkAccessService],
  exports: [NetworkAccessService],
})
export class NetworkAccessModule {}


