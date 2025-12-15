import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { JobProcessorService } from './job-processor.service';
import { Job, JobSchema } from './schemas/job.schema';
import { ClustersModule } from '../clusters/clusters.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { EventsModule } from '../events/events.module';
import { BackupsModule } from '../backups/backups.module';
import { UsersModule } from '../users/users.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
    forwardRef(() => ClustersModule),
    forwardRef(() => BackupsModule),
    forwardRef(() => ProjectsModule),
    KubernetesModule,
    EventsModule,
    UsersModule,
  ],
  providers: [JobsService, JobProcessorService],
  exports: [JobsService],
})
export class JobsModule {}

