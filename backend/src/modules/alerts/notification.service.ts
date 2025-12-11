import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { NotificationChannel, NotificationChannelDocument, ChannelType } from './schemas/notification-channel.schema';
import { AlertHistory } from './schemas/alert-history.schema';
import { CreateNotificationChannelDto, UpdateNotificationChannelDto } from './dto/create-notification-channel.dto';
import { EmailService } from '../email/email.service';

export interface NotificationPayload {
  alert: AlertHistory;
  clusterName?: string;
  orgName?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectModel(NotificationChannel.name) private channelModel: Model<NotificationChannelDocument>,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

  // ==================== Channels ====================

  async createChannel(
    orgId: string,
    userId: string,
    createDto: CreateNotificationChannelDto,
  ): Promise<NotificationChannel> {
    // Validate config based on type
    this.validateChannelConfig(createDto.type, createDto.config);

    const channel = new this.channelModel({
      orgId,
      name: createDto.name,
      type: createDto.type,
      config: createDto.config,
      enabled: createDto.enabled !== false,
      createdBy: new Types.ObjectId(userId),
    });

    await channel.save();
    this.logger.log(`Created notification channel "${createDto.name}" for org ${orgId}`);
    return channel;
  }

  async findChannelsByOrg(orgId: string): Promise<NotificationChannel[]> {
    return this.channelModel.find({ orgId }).sort({ createdAt: -1 }).exec();
  }

  async findChannelById(channelId: string): Promise<NotificationChannelDocument | null> {
    return this.channelModel.findById(channelId).exec();
  }

  async updateChannel(
    channelId: string,
    updateDto: UpdateNotificationChannelDto,
  ): Promise<NotificationChannel> {
    const channel = await this.findChannelById(channelId);
    if (!channel) {
      throw new NotFoundException('Notification channel not found');
    }

    if (updateDto.name !== undefined) channel.name = updateDto.name;
    if (updateDto.config !== undefined) {
      this.validateChannelConfig(channel.type, updateDto.config);
      channel.config = { ...channel.config, ...updateDto.config };
    }
    if (updateDto.enabled !== undefined) channel.enabled = updateDto.enabled;

    await channel.save();
    return channel;
  }

  async deleteChannel(channelId: string): Promise<void> {
    const result = await this.channelModel.findByIdAndDelete(channelId).exec();
    if (!result) {
      throw new NotFoundException('Notification channel not found');
    }
  }

  // ==================== Send Notifications ====================

  async sendNotification(
    channel: NotificationChannelDocument,
    payload: NotificationPayload,
  ): Promise<boolean> {
    if (!channel.enabled) {
      this.logger.debug(`Channel ${channel.id} is disabled, skipping`);
      return false;
    }

    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmailNotification(channel, payload);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, payload);
          break;
        case 'slack':
          await this.sendSlackNotification(channel, payload);
          break;
        default:
          this.logger.warn(`Unknown channel type: ${channel.type}`);
          return false;
      }

      // Update channel stats
      channel.lastUsedAt = new Date();
      channel.failureCount = 0;
      channel.lastError = undefined;
      await channel.save();

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send notification via ${channel.type}: ${error.message}`);
      
      // Update failure stats
      channel.failureCount += 1;
      channel.lastError = error.message;
      
      // Disable after 5 failures
      if (channel.failureCount >= 5) {
        channel.enabled = false;
        this.logger.warn(`Channel ${channel.id} disabled after 5 failures`);
      }
      
      await channel.save();
      return false;
    }
  }

  async sendToMultipleChannels(
    channelIds: string[],
    payload: NotificationPayload,
  ): Promise<string[]> {
    const successfulChannels: string[] = [];

    for (const channelId of channelIds) {
      const channel = await this.findChannelById(channelId);
      if (channel) {
        const success = await this.sendNotification(channel, payload);
        if (success) {
          successfulChannels.push(channelId);
        }
      }
    }

    return successfulChannels;
  }

  async testChannel(channelId: string, testMessage?: string): Promise<{ success: boolean; error?: string }> {
    const channel = await this.findChannelById(channelId);
    if (!channel) {
      throw new NotFoundException('Notification channel not found');
    }

    const testPayload: NotificationPayload = {
      alert: {
        id: 'test-alert-id',
        alertName: 'Test Alert',
        metricType: 'cpu_usage',
        severity: 'info',
        status: 'firing',
        threshold: 80,
        currentValue: 85,
        message: testMessage || 'This is a test notification from EUTLAS',
        firedAt: new Date(),
      } as any,
      clusterName: 'test-cluster',
      orgName: 'Test Organization',
    };

    const originalEnabled = channel.enabled;
    channel.enabled = true; // Temporarily enable for test

    try {
      await this.sendNotification(channel, testPayload);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      channel.enabled = originalEnabled;
      await channel.save();
    }
  }

  // ==================== Private Methods ====================

  private async sendEmailNotification(
    channel: NotificationChannelDocument,
    payload: NotificationPayload,
  ): Promise<void> {
    const emails = channel.config.emails || [];
    if (emails.length === 0) {
      throw new Error('No email addresses configured');
    }

    const alertUrl = `${this.frontendUrl}/dashboard/alerts/${payload.alert.id}`;
    const severityEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      critical: '🚨',
    }[payload.alert.severity];

    for (const email of emails) {
      await this.emailService.sendAlertEmail({
        to: email,
        alertName: payload.alert.alertName,
        severity: payload.alert.severity,
        message: payload.alert.message,
        clusterName: payload.clusterName || 'Unknown',
        alertUrl,
        firedAt: payload.alert.firedAt,
      });
    }
  }

  private async sendWebhookNotification(
    channel: NotificationChannelDocument,
    payload: NotificationPayload,
  ): Promise<void> {
    const { webhookUrl, webhookSecret, webhookHeaders } = channel.config;
    if (!webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    const body = {
      event: 'alert.fired',
      alert: {
        id: payload.alert.id,
        name: payload.alert.alertName,
        severity: payload.alert.severity,
        status: payload.alert.status,
        message: payload.alert.message,
        metricType: payload.alert.metricType,
        threshold: payload.alert.threshold,
        currentValue: payload.alert.currentValue,
        firedAt: payload.alert.firedAt,
      },
      cluster: payload.clusterName,
      organization: payload.orgName,
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...webhookHeaders,
    };

    // Add signature if secret is configured
    if (webhookSecret) {
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(body))
        .digest('hex');
      headers['X-EUTLAS-Signature'] = `sha256=${signature}`;
    }

    await axios.post(webhookUrl, body, { headers, timeout: 10000 });
  }

  private async sendSlackNotification(
    channel: NotificationChannelDocument,
    payload: NotificationPayload,
  ): Promise<void> {
    const { slackWebhookUrl, slackChannel } = channel.config;
    if (!slackWebhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const severityColor = {
      info: '#36a64f',
      warning: '#ff9800',
      critical: '#f44336',
    }[payload.alert.severity];

    const alertUrl = `${this.frontendUrl}/dashboard/alerts/${payload.alert.id}`;

    const slackPayload = {
      channel: slackChannel,
      attachments: [
        {
          color: severityColor,
          title: `${payload.alert.severity.toUpperCase()}: ${payload.alert.alertName}`,
          title_link: alertUrl,
          text: payload.alert.message,
          fields: [
            { title: 'Cluster', value: payload.clusterName || 'N/A', short: true },
            { title: 'Metric', value: payload.alert.metricType, short: true },
            { title: 'Threshold', value: String(payload.alert.threshold), short: true },
            { title: 'Current Value', value: String(payload.alert.currentValue.toFixed(1)), short: true },
          ],
          footer: 'EUTLAS Alert',
          ts: Math.floor(payload.alert.firedAt.getTime() / 1000),
        },
      ],
    };

    await axios.post(slackWebhookUrl, slackPayload, { timeout: 10000 });
  }

  private validateChannelConfig(type: ChannelType, config: any): void {
    switch (type) {
      case 'email':
        if (!config.emails || !Array.isArray(config.emails) || config.emails.length === 0) {
          throw new BadRequestException('Email channel requires at least one email address');
        }
        break;
      case 'webhook':
        if (!config.webhookUrl) {
          throw new BadRequestException('Webhook channel requires a webhook URL');
        }
        break;
      case 'slack':
        if (!config.slackWebhookUrl) {
          throw new BadRequestException('Slack channel requires a webhook URL');
        }
        break;
    }
  }
}



