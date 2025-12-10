import { Module, forwardRef } from '@nestjs/common';
import { DataExplorerController } from './data-explorer.controller';
import { DataExplorerService } from './data-explorer.service';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [
    forwardRef(() => ClustersModule),
    ProjectsModule,
    OrgsModule,
    CredentialsModule,
  ],
  controllers: [DataExplorerController],
  providers: [DataExplorerService],
  exports: [DataExplorerService],
})
export class DataExplorerModule {}


