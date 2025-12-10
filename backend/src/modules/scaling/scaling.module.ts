import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScalingController, OrgScalingController } from './scaling.controller';
import { ScalingService } from './scaling.service';
import { AutoScalingService } from './auto-scaling.service';
import { ScalingRecommendation, ScalingRecommendationSchema } from './schemas/scaling-recommendation.schema';
import { MetricsModule } from '../metrics/metrics.module';
import { ClustersModule } from '../clusters/clusters.module';
import { JobsModule } from '../jobs/jobs.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScalingRecommendation.name, schema: ScalingRecommendationSchema },
    ]),
    MetricsModule,
    forwardRef(() => ClustersModule),
    forwardRef(() => JobsModule),
    EventsModule,
    AuditModule,
  ],
  controllers: [ScalingController, OrgScalingController],
  providers: [ScalingService, AutoScalingService],
  exports: [ScalingService, AutoScalingService],
})
export class ScalingModule {}

