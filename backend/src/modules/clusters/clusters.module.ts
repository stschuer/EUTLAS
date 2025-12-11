import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClustersController } from './clusters.controller';
import { ClustersService } from './clusters.service';
import { Cluster, ClusterSchema } from './schemas/cluster.schema';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';
import { JobsModule } from '../jobs/jobs.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cluster.name, schema: ClusterSchema }]),
    ProjectsModule,
    OrgsModule,
    forwardRef(() => JobsModule),
    CredentialsModule,
  ],
  controllers: [ClustersController],
  providers: [ClustersService],
  exports: [ClustersService],
})
export class ClustersModule {}



