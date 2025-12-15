import { IsString, IsOptional, IsArray, IsBoolean, IsEnum, IsObject, IsEmail, IsUrl, MaxLength, ArrayMaxSize, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class EmailConfig {
  @ApiProperty({ example: ['admin@example.com'], description: 'Email addresses' })
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(10)
  emails: string[];
}

class WebhookConfig {
  @ApiProperty({ example: 'https://example.com/webhook' })
  @IsUrl()
  webhookUrl: string;

  @ApiProperty({ required: false, example: 'secret123' })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiProperty({ required: false, example: { 'X-Custom': 'header' } })
  @IsOptional()
  @IsObject()
  webhookHeaders?: Record<string, string>;
}

class SlackConfig {
  @ApiProperty({ example: 'https://hooks.slack.com/services/...' })
  @IsUrl()
  slackWebhookUrl: string;

  @ApiProperty({ required: false, example: '#alerts' })
  @IsOptional()
  @IsString()
  slackChannel?: string;
}

export class CreateNotificationChannelDto {
  @ApiProperty({ example: 'Ops Team Email', description: 'Name for the channel' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ['email', 'webhook', 'slack'] })
  @IsEnum(['email', 'webhook', 'slack'])
  type: 'email' | 'webhook' | 'slack';

  @ApiProperty({ description: 'Configuration based on type' })
  @IsObject()
  config: EmailConfig | WebhookConfig | SlackConfig;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateNotificationChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TestNotificationChannelDto {
  @ApiProperty({ required: false, example: 'Test message' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  testMessage?: string;
}





