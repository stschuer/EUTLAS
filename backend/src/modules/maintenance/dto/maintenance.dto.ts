import { IsString, IsEnum, IsBoolean, IsOptional, IsNumber, Min, Max, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaintenanceWindowDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] })
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek: string;

  @ApiProperty({ minimum: 0, maximum: 23 })
  @IsNumber()
  @Min(0)
  @Max(23)
  startHour: number;

  @ApiProperty({ minimum: 1, maximum: 8, default: 4 })
  @IsNumber()
  @Min(1)
  @Max(8)
  durationHours: number;

  @ApiPropertyOptional({ default: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoDeferEnabled?: boolean;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @IsNumber()
  maxDeferDays?: number;
}

export class UpdateMaintenanceWindowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] })
  @IsOptional()
  @IsEnum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  startHour?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8)
  durationHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoDeferEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxDeferDays?: number;
}

export class DeferMaintenanceDto {
  @ApiProperty({ description: 'Number of days to defer (1-7)' })
  @IsNumber()
  @Min(1)
  @Max(7)
  days: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ScheduleEmergencyMaintenanceDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  scheduledStartTime: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  estimatedDurationMinutes: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresDowntime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  affectedComponents?: string[];
}



