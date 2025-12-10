import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { Backup, BackupSchema } from './schemas/backup.schema';
import { BackupPolicy, BackupPolicySchema } from './schemas/backup-policy.schema';
import { BackupPolicyController } from './backup-policy.controller';
import { BackupPolicyService } from './backup-policy.service';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';
import { JobsModule } from '../jobs/jobs.module';
import { EventsModule } from '../events/events.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Backup.name, schema: BackupSchema },
      { name: BackupPolicy.name, schema: BackupPolicySchema },
    ]),
    forwardRef(() => ClustersModule),
    forwardRef(() => JobsModule),
    ProjectsModule,
    OrgsModule,
    EventsModule,
    AuditModule,
  ],
  controllers: [BackupsController, BackupPolicyController],
  providers: [BackupsService, BackupPolicyService],
  exports: [BackupsService, BackupPolicyService],
})
export class BackupsModule {}
