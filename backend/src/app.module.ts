import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';

// Common
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { SecurityMiddleware, IpExtractionMiddleware } from './common/middleware/security.middleware';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ClustersModule } from './modules/clusters/clusters.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { BackupsModule } from './modules/backups/backups.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { KubernetesModule } from './modules/kubernetes/kubernetes.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { DatabaseUsersModule } from './modules/database-users/database-users.module';
import { NetworkAccessModule } from './modules/network-access/network-access.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { EmailModule } from './modules/email/email.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { DataExplorerModule } from './modules/data-explorer/data-explorer.module';
import { PerformanceAdvisorModule } from './modules/performance-advisor/performance-advisor.module';
import { BillingModule } from './modules/billing/billing.module';
import { PitrModule } from './modules/pitr/pitr.module';
import { SearchIndexesModule } from './modules/search-indexes/search-indexes.module';
import { ScalingModule } from './modules/scaling/scaling.module';
import { LogForwardingModule } from './modules/log-forwarding/log-forwarding.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { OnlineArchiveModule } from './modules/online-archive/online-archive.module';
import { AuditModule } from './modules/audit/audit.module';
import { ClusterSettingsModule } from './modules/cluster-settings/cluster-settings.module';
import { PrivateNetworksModule } from './modules/private-networks/private-networks.module';
import { SchemaValidationModule } from './modules/schema-validation/schema-validation.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { SsoModule } from './modules/sso/sso.module';
import { VectorSearchModule } from './modules/vector-search/vector-search.module';
import { AdminModule } from './modules/admin/admin.module';
import { MigrationModule } from './modules/migration/migration.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { SeedModule } from './modules/seed/seed.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    
    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017/eutlas'),
      }),
      inject: [ConfigService],
    }),
    
    // Scheduler for background jobs
    ScheduleModule.forRoot(),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,  // 1 second
        limit: 10,  // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 50,  // 50 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 200, // 200 requests per minute
      },
    ]),
    
    // Feature Modules
    AuthModule,
    UsersModule,
    OrgsModule,
    ProjectsModule,
    ClustersModule,
    JobsModule,
    BackupsModule,
    EventsModule,
    HealthModule,
    KubernetesModule,
    CredentialsModule,
    DatabaseUsersModule,
    NetworkAccessModule,
    MetricsModule,
    InvitationsModule,
    ApiKeysModule,
    EmailModule,
    AlertsModule,
    DataExplorerModule,
    PerformanceAdvisorModule,
    BillingModule,
    PitrModule,
    SearchIndexesModule,
    ScalingModule,
    LogForwardingModule,
    MaintenanceModule,
    OnlineArchiveModule,
    AuditModule,
    ClusterSettingsModule,
    PrivateNetworksModule,
    SchemaValidationModule,
    DashboardsModule,
    SsoModule,
    VectorSearchModule,
    AdminModule,
    MigrationModule,
    GdprModule,
    SeedModule,
  ],
  providers: [
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Global rate limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(IpExtractionMiddleware, SecurityMiddleware, CorrelationIdMiddleware)
      .forRoutes('*');
  }
}
