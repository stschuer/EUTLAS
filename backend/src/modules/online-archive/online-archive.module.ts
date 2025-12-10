import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OnlineArchiveController } from './online-archive.controller';
import { OnlineArchiveService } from './online-archive.service';
import { ArchiveRule, ArchiveRuleSchema } from './schemas/archive-rule.schema';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArchiveRule.name, schema: ArchiveRuleSchema },
    ]),
    EventsModule,
  ],
  controllers: [OnlineArchiveController],
  providers: [OnlineArchiveService],
  exports: [OnlineArchiveService],
})
export class OnlineArchiveModule {}


