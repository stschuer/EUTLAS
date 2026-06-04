import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CredentialsService } from './credentials.service';
import { ClustersModule } from '../clusters/clusters.module';

@Module({
  imports: [ConfigModule, forwardRef(() => ClustersModule)],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}





