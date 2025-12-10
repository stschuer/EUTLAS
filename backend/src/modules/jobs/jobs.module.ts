import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { JobProcessorService } from './job-processor.service';
import { Job, JobSchema } from './schemas/job.schema';
import { ClustersModule } from '../clusters/clusters.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { EventsModule } from '../events/events.module';
import { BackupsModule } from '../backups/backups.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
    forwardRef(() => ClustersModule),
    forwardRef(() => BackupsModule),
    KubernetesModule,
    EventsModule,
  ],
  providers: [JobsService, JobProcessorService],
  exports: [JobsService],
})
export class JobsModule {}

