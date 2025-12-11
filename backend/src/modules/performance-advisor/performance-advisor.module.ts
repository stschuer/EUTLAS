import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PerformanceAdvisorController } from './performance-advisor.controller';
import { PerformanceAdvisorService } from './performance-advisor.service';
import { SlowQuery, SlowQuerySchema } from './schemas/slow-query.schema';
import { IndexSuggestion, IndexSuggestionSchema } from './schemas/index-suggestion.schema';
import { DataExplorerModule } from '../data-explorer/data-explorer.module';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SlowQuery.name, schema: SlowQuerySchema },
      { name: IndexSuggestion.name, schema: IndexSuggestionSchema },
    ]),
    forwardRef(() => DataExplorerModule),
    forwardRef(() => ClustersModule),
    ProjectsModule,
    OrgsModule,
  ],
  controllers: [PerformanceAdvisorController],
  providers: [PerformanceAdvisorService],
  exports: [PerformanceAdvisorService],
})
export class PerformanceAdvisorModule {}



