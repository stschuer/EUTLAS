import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HetznerProvisionerService } from './hetzner-provisioner.service';

@Module({
  imports: [ConfigModule],
  providers: [HetznerProvisionerService],
  exports: [HetznerProvisionerService],
})
export class HetznerModule {}
