import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsEnhancedService } from './events-enhanced.service';
import { EventsGateway } from './events.gateway';
import { ActivityFeedController } from './events-enhanced.controller';
import { Event, EventSchema } from './schemas/event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [EventsController, ActivityFeedController],
  providers: [EventsService, EventsEnhancedService, EventsGateway],
  exports: [EventsService, EventsEnhancedService, EventsGateway],
})
export class EventsModule {}
