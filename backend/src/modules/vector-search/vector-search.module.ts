import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VectorSearchController } from './vector-search.controller';
import { VectorSearchService } from './vector-search.service';
import { VectorSyncService } from './vector-sync.service';
import { VectorIndex, VectorIndexSchema } from './schemas/vector-index.schema';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';
import { EventsModule } from '../events/events.module';
import { DataExplorerModule } from '../data-explorer/data-explorer.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VectorIndex.name, schema: VectorIndexSchema },
    ]),
    ClustersModule,
    ProjectsModule,
    OrgsModule,
    EventsModule,
    forwardRef(() => DataExplorerModule),
  ],
  controllers: [VectorSearchController],
  providers: [VectorSearchService, VectorSyncService],
  exports: [VectorSearchService, VectorSyncService],
})
export class VectorSearchModule {}
