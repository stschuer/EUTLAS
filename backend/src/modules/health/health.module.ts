import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { KubernetesModule } from '../kubernetes/kubernetes.module';

@Module({
  imports: [
    MongooseModule,
    KubernetesModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
