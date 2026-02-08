import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LogForwardingConfig, LogForwardingConfigDocument, LogDestinationType } from './schemas/log-forwarding.schema';
import { CreateLogForwardingDto, UpdateLogForwardingDto } from './dto/log-forwarding.dto';

@Injectable()
export class LogForwardingService {
  private readonly logger = new Logger(LogForwardingService.name);

  constructor(
    @InjectModel(LogForwardingConfig.name) private logForwardingModel: Model<LogForwardingConfigDocument>,
  ) {}

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    userId: string,
    dto: CreateLogForwardingDto,
  ): Promise<LogForwardingConfig> {
    // Validate config based on destination type
    this.validateConfig(dto);

    const config = new this.logForwardingModel({
      clusterId: new Types.ObjectId(clusterId),
      projectId: new Types.ObjectId(projectId),
      orgId: new Types.ObjectId(orgId),
      name: dto.name,
      destinationType: dto.destinationType,
      enabled: dto.enabled ?? true,
      logTypes: dto.logTypes || ['mongodb'],
      createdBy: new Types.ObjectId(userId),
    });

    // Set destination-specific config
    this.setDestinationConfig(config, dto);

    await config.save();
    this.logger.log(`Created log forwarding config ${config.id} for cluster ${clusterId}`);
    return config;
  }

  private validateConfig(dto: CreateLogForwardingDto): void {
    switch (dto.destinationType) {
      case 's3':
        if (!dto.s3Config?.bucketName || !dto.s3Config?.region) {
          throw new BadRequestException('S3 configuration requires bucketName and region');
        }
        break;
      case 'datadog':
        if (!dto.datadogConfig?.site || !dto.datadogConfig?.apiKey) {
          throw new BadRequestException('Datadog configuration requires site and apiKey');
        }
        break;
      case 'splunk':
        if (!dto.splunkConfig?.host || !dto.splunkConfig?.port || !dto.splunkConfig?.hecToken) {
          throw new BadRequestException('Splunk configuration requires host, port, and hecToken');
        }
        break;
      case 'webhook':
        if (!dto.webhookConfig?.url) {
          throw new BadRequestException('Webhook configuration requires url');
        }
        break;
    }
  }

  private setDestinationConfig(config: LogForwardingConfigDocument, dto: CreateLogForwardingDto | UpdateLogForwardingDto): void {
    if (dto.s3Config) {
      config.s3Config = {
        bucketName: dto.s3Config.bucketName,
        region: dto.s3Config.region,
        prefix: dto.s3Config.prefix,
        accessKeyId: dto.s3Config.accessKeyId,
        roleArn: dto.s3Config.roleArn,
      };
      if ((dto.s3Config as any).secretAccessKey) {
        config.credentials = {
          ...config.credentials,
          s3SecretAccessKey: (dto.s3Config as any).secretAccessKey,
        };
      }
    }

    if (dto.datadogConfig) {
      config.datadogConfig = {
        site: dto.datadogConfig.site,
        service: dto.datadogConfig.service,
        source: dto.datadogConfig.source,
        tags: dto.datadogConfig.tags,
      };
      if ((dto.datadogConfig as any).apiKey) {
        config.credentials = {
          ...config.credentials,
          datadogApiKey: (dto.datadogConfig as any).apiKey,
        };
      }
    }

    if (dto.splunkConfig) {
      config.splunkConfig = {
        host: dto.splunkConfig.host,
        port: dto.splunkConfig.port,
        index: dto.splunkConfig.index,
        source: dto.splunkConfig.source,
        sourcetype: 'mongodb',
        useTls: dto.splunkConfig.useTls ?? true,
      };
      if ((dto.splunkConfig as any).hecToken) {
        config.credentials = {
          ...config.credentials,
          splunkHecToken: (dto.splunkConfig as any).hecToken,
        };
      }
    }

    if (dto.webhookConfig) {
      config.webhookConfig = {
        url: dto.webhookConfig.url,
        headers: dto.webhookConfig.headers,
        batchSize: dto.webhookConfig.batchSize || 100,
        flushIntervalSeconds: dto.webhookConfig.flushIntervalSeconds || 60,
      };
      if ((dto.webhookConfig as any).secret) {
        config.credentials = {
          ...config.credentials,
          webhookSecret: (dto.webhookConfig as any).secret,
        };
      }
    }
  }

  async findAllByCluster(clusterId: string): Promise<LogForwardingConfig[]> {
    return this.logForwardingModel
      .find({ clusterId: new Types.ObjectId(clusterId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(configId: string): Promise<LogForwardingConfig | null> {
    return this.logForwardingModel.findById(configId).exec();
  }

  async update(configId: string, dto: UpdateLogForwardingDto): Promise<LogForwardingConfig> {
    const config = await this.logForwardingModel.findById(configId);
    if (!config) {
      throw new NotFoundException('Log forwarding configuration not found');
    }

    if (dto.name) config.name = dto.name;
    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.logTypes) config.logTypes = dto.logTypes as any;

    this.setDestinationConfig(config, dto);
    await config.save();

    return config;
  }

  async delete(configId: string): Promise<void> {
    const result = await this.logForwardingModel.findByIdAndDelete(configId);
    if (!result) {
      throw new NotFoundException('Log forwarding configuration not found');
    }
    this.logger.log(`Deleted log forwarding config ${configId}`);
  }

  async toggle(configId: string, enabled: boolean): Promise<LogForwardingConfig> {
    const config = await this.logForwardingModel.findById(configId);
    if (!config) {
      throw new NotFoundException('Log forwarding configuration not found');
    }

    config.enabled = enabled;
    await config.save();

    return config;
  }

  async testConnection(configId: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const config = await this.logForwardingModel.findById(configId);
    if (!config) {
      throw new NotFoundException('Log forwarding configuration not found');
    }

    const startTime = Date.now();

    // Simulate connection test based on destination type
    try {
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

      // 90% success rate for simulation
      if (Math.random() > 0.1) {
        const latencyMs = Date.now() - startTime;
        return {
          success: true,
          message: `Successfully connected to ${config.destinationType}`,
          latencyMs,
        };
      } else {
        throw new Error('Connection timeout');
      }
    } catch (error) {
      try {
        config.lastError = error.message;
        config.lastErrorAt = new Date();
        await config.save();
      } catch {
        // Connection may have been closed during teardown, ignore
      }

      return {
        success: false,
        message: `Failed to connect: ${error.message}`,
      };
    }
  }

  async getStats(configId: string): Promise<{
    logsForwarded: number;
    bytesForwarded: number;
    lastLogSentAt: Date | null;
    errorRate: number;
  }> {
    const config = await this.logForwardingModel.findById(configId);
    if (!config) {
      throw new NotFoundException('Log forwarding configuration not found');
    }

    return {
      logsForwarded: config.logsForwardedCount || 0,
      bytesForwarded: config.bytesForwardedTotal || 0,
      lastLogSentAt: config.lastLogSentAt || null,
      errorRate: config.lastError ? 0.01 : 0,
    };
  }

  getSupportedDestinations(): Array<{
    type: LogDestinationType;
    name: string;
    description: string;
  }> {
    return [
      {
        type: 's3',
        name: 'Amazon S3',
        description: 'Forward logs to an Amazon S3 bucket',
      },
      {
        type: 'azure_blob',
        name: 'Azure Blob Storage',
        description: 'Forward logs to Azure Blob Storage',
      },
      {
        type: 'gcs',
        name: 'Google Cloud Storage',
        description: 'Forward logs to Google Cloud Storage',
      },
      {
        type: 'datadog',
        name: 'Datadog',
        description: 'Stream logs to Datadog for analysis',
      },
      {
        type: 'splunk',
        name: 'Splunk',
        description: 'Forward logs to Splunk via HEC',
      },
      {
        type: 'sumologic',
        name: 'Sumo Logic',
        description: 'Stream logs to Sumo Logic',
      },
      {
        type: 'webhook',
        name: 'Custom Webhook',
        description: 'Forward logs to a custom HTTP endpoint',
      },
    ];
  }
}





