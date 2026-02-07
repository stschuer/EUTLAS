import { Module } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [GdprController],
  providers: [GdprService],
  exports: [GdprService],
})
export class GdprModule {}
