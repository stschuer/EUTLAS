import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsController } from './alerts.controller';
import { NotificationChannelsController } from './notification-channels.controller';
import { AlertsService } from './alerts.service';
import { NotificationService } from './notification.service';
import { AlertEngineService } from './alert-engine.service';
import { AlertRule, AlertRuleSchema } from './schemas/alert-rule.schema';
import { AlertHistory, AlertHistorySchema } from './schemas/alert-history.schema';
import { NotificationChannel, NotificationChannelSchema } from './schemas/notification-channel.schema';
import { Cluster, ClusterSchema } from '../clusters/schemas/cluster.schema';
import { OrgsModule } from '../orgs/orgs.module';
import { EventsModule } from '../events/events.module';
import { MetricsModule } from '../metrics/metrics.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AlertRule.name, schema: AlertRuleSchema },
      { name: AlertHistory.name, schema: AlertHistorySchema },
      { name: NotificationChannel.name, schema: NotificationChannelSchema },
      { name: Cluster.name, schema: ClusterSchema },
    ]),
    forwardRef(() => OrgsModule),
    EventsModule,
    MetricsModule,
    EmailModule,
  ],
  controllers: [AlertsController, NotificationChannelsController],
  providers: [AlertsService, NotificationService, AlertEngineService],
  exports: [AlertsService, NotificationService],
})
export class AlertsModule {}





