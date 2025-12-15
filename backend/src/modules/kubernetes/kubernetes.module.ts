import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KubernetesService } from './kubernetes.service';

@Module({
  imports: [ConfigModule],
  providers: [KubernetesService],
  exports: [KubernetesService],
})
export class KubernetesModule {}





