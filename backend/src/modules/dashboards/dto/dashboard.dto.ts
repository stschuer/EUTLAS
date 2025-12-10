import { IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class WidgetPositionDto {
  @ApiProperty()
  x: number;

  @ApiProperty()
  y: number;

  @ApiProperty()
  width: number;

  @ApiProperty()
  height: number;
}

class WidgetQueryDto {
  @ApiProperty()
  @IsString()
  metric: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aggregation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  groupBy?: string;
}

class WidgetOptionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  thresholds?: Array<{ value: number; color: string }>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  decimals?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLegend?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stacked?: boolean;
}

export class CreateWidgetDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ enum: ['line_chart', 'area_chart', 'bar_chart', 'gauge', 'stat', 'table', 'heatmap', 'pie_chart'] })
  @IsEnum(['line_chart', 'area_chart', 'bar_chart', 'gauge', 'stat', 'table', 'heatmap', 'pie_chart'])
  type: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  metrics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  query?: WidgetQueryDto;

  @ApiProperty()
  @IsObject()
  position: WidgetPositionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  options?: WidgetOptionsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateDashboardDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clusterId?: string;

  @ApiPropertyOptional({ type: [CreateWidgetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWidgetDto)
  widgets?: CreateWidgetDto[];

  @ApiPropertyOptional({ enum: ['private', 'org', 'public'] })
  @IsOptional()
  @IsEnum(['private', 'org', 'public'])
  visibility?: 'private' | 'org' | 'public';

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layout?: {
    columns: number;
    rowHeight: number;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  timeRange?: {
    from: string;
    to: string;
    refresh?: number;
  };
}

export class UpdateDashboardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [CreateWidgetDto] })
  @IsOptional()
  @IsArray()
  widgets?: CreateWidgetDto[];

  @ApiPropertyOptional({ enum: ['private', 'org', 'public'] })
  @IsOptional()
  @IsEnum(['private', 'org', 'public'])
  visibility?: 'private' | 'org' | 'public';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layout?: {
    columns: number;
    rowHeight: number;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  timeRange?: {
    from: string;
    to: string;
    refresh?: number;
  };
}

export class AddWidgetDto extends CreateWidgetDto {}

export class UpdateWidgetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  position?: WidgetPositionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  options?: WidgetOptionsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  query?: WidgetQueryDto;
}


