import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsGateway } from './metrics.gateway';
import { Metric, MetricSchema } from './schemas/metric.schema';
import { Cluster, ClusterSchema } from '../clusters/schemas/cluster.schema';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Metric.name, schema: MetricSchema },
      { name: Cluster.name, schema: ClusterSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => ClustersModule),
    ProjectsModule,
    OrgsModule,
  ],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsGateway],
  exports: [MetricsService, MetricsGateway],
})
export class MetricsModule {}

