import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LogForwardingController } from './log-forwarding.controller';
import { LogForwardingService } from './log-forwarding.service';
import { LogForwardingConfig, LogForwardingConfigSchema } from './schemas/log-forwarding.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LogForwardingConfig.name, schema: LogForwardingConfigSchema },
    ]),
  ],
  controllers: [LogForwardingController],
  providers: [LogForwardingService],
  exports: [LogForwardingService],
})
export class LogForwardingModule {}



