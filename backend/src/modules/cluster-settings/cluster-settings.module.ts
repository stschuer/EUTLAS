import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClusterSettingsController } from './cluster-settings.controller';
import { ClusterSettingsService } from './cluster-settings.service';
import { ClusterSettings, ClusterSettingsSchema } from './schemas/cluster-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClusterSettings.name, schema: ClusterSettingsSchema },
    ]),
  ],
  controllers: [ClusterSettingsController],
  providers: [ClusterSettingsService],
  exports: [ClusterSettingsService],
})
export class ClusterSettingsModule {}



