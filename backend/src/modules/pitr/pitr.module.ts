import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PitrService } from './pitr.service';
import { PitrController } from './pitr.controller';
import { PitrConfig, PitrConfigSchema } from './schemas/pitr-config.schema';
import { OplogEntry, OplogEntrySchema } from './schemas/oplog-entry.schema';
import { PitrRestore, PitrRestoreSchema } from './schemas/pitr-restore.schema';
import { EventsModule } from '../events/events.module';
import { BackupsModule } from '../backups/backups.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PitrConfig.name, schema: PitrConfigSchema },
      { name: OplogEntry.name, schema: OplogEntrySchema },
      { name: PitrRestore.name, schema: PitrRestoreSchema },
    ]),
    EventsModule,
    BackupsModule,
  ],
  controllers: [PitrController],
  providers: [PitrService],
  exports: [PitrService],
})
export class PitrModule {}


