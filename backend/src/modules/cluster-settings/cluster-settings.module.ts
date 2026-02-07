import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClusterSettingsController } from './cluster-settings.controller';
import { ClusterSettingsService } from './cluster-settings.service';
import { ClusterSettings, ClusterSettingsSchema } from './schemas/cluster-settings.schema';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClusterSettings.name, schema: ClusterSettingsSchema },
    ]),
    AuditModule,
  ],
  controllers: [ClusterSettingsController],
  providers: [ClusterSettingsService],
  exports: [ClusterSettingsService],
})
export class ClusterSettingsModule {}





