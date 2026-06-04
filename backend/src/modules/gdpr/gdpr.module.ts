import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GdprService } from './gdpr.service';
import { GdprController } from './gdpr.controller';
import { GdprRequest, GdprRequestSchema } from './schemas/gdpr-request.schema';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { OrgsModule } from '../orgs/orgs.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GdprRequest.name, schema: GdprRequestSchema }]),
    AuditModule,
    EventsModule,
    OrgsModule,
  ],
  controllers: [GdprController],
  providers: [GdprService],
  exports: [GdprService],
})
export class GdprModule {}
