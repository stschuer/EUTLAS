import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cluster, ClusterSchema } from '../clusters/schemas/cluster.schema';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { HetznerDnsService } from '../dns/hetzner-dns.service';
import { PlatformCaService } from './platform-ca.service';
import { ClusterTlsService } from './cluster-tls.service';
import { TlsController } from './tls.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cluster.name, schema: ClusterSchema }]),
    KubernetesModule,
    forwardRef(() => CredentialsModule),
  ],
  controllers: [TlsController],
  providers: [HetznerDnsService, PlatformCaService, ClusterTlsService],
  exports: [ClusterTlsService, PlatformCaService, HetznerDnsService],
})
export class TlsModule {}
