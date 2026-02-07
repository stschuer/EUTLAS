import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { MigrationService } from './migration.service';
import { MigrationController } from './migration.controller';
import { Migration, MigrationSchema } from './schemas/migration.schema';
import { EventsModule } from '../events/events.module';
import { ClustersModule } from '../clusters/clusters.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Migration.name, schema: MigrationSchema },
    ]),
    ConfigModule,
    EventsModule,
    forwardRef(() => ClustersModule),
    forwardRef(() => JobsModule),
  ],
  controllers: [MigrationController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationModule {}
