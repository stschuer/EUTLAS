import { IsString, IsOptional, IsNumber, IsObject, IsEnum, IsEmail, IsBoolean, Min, Max, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ==================== Billing Account ====================

class AddressDto {
  @IsOptional()
  @IsString()
  line1?: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export class CreateBillingAccountDto {
  @ApiProperty({ required: false, example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @ApiProperty({ example: 'billing@acme.com' })
  @IsEmail()
  billingEmail: string;

  @ApiProperty({ required: false, example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiProperty({ required: false, example: 'DE123456789' })
  @IsOptional()
  @IsString()
  vatId?: string;

  @ApiProperty({ required: false, default: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateBillingAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsString()
  vatId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @IsOptional()
  @IsEnum(['monthly', 'annual'])
  billingCycle?: 'monthly' | 'annual';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  billingDay?: number;
}

// ==================== Invoice ====================

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Billing period start date (ISO string)' })
  @IsString()
  billingPeriodStart: string;

  @ApiProperty({ description: 'Billing period end date (ISO string)' })
  @IsString()
  billingPeriodEnd: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsEnum(['draft', 'open', 'paid', 'void'])
  status?: 'draft' | 'open' | 'paid' | 'void';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  discountCents?: number;

  @IsOptional()
  @IsString()
  discountDescription?: string;
}

export class VoidInvoiceDto {
  @ApiProperty({ example: 'Customer requested cancellation' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class MarkInvoicePaidDto {
  @ApiProperty({ required: false, description: 'Payment date (defaults to now)' })
  @IsOptional()
  @IsString()
  paidAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  paymentReference?: string;
}

// ==================== Usage ====================

export class RecordUsageDto {
  @ApiProperty({ required: false, description: 'Cluster ID (optional for org-level usage)' })
  @IsOptional()
  @IsString()
  clusterId?: string;

  @ApiProperty({ enum: ['cluster_hours', 'storage_gb_hours', 'data_transfer_gb', 'backup_storage_gb'] })
  @IsEnum(['cluster_hours', 'storage_gb_hours', 'data_transfer_gb', 'backup_storage_gb'])
  usageType: string;

  @ApiProperty({ example: 24 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class QueryUsageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clusterId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  usageType?: string;

  @ApiProperty({ required: false, description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

// ==================== Prices ====================

export class CreatePriceDto {
  @ApiProperty({ example: 'plan_dev' })
  @IsString()
  priceCode: string;

  @ApiProperty({ example: 'Development Plan' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['plan', 'usage', 'addon'] })
  @IsEnum(['plan', 'usage', 'addon'])
  category: 'plan' | 'usage' | 'addon';

  @ApiProperty({ enum: ['flat', 'per_unit', 'tiered'], default: 'flat' })
  @IsOptional()
  @IsEnum(['flat', 'per_unit', 'tiered'])
  pricingModel?: 'flat' | 'per_unit' | 'tiered';

  @ApiProperty({ required: false, example: 900 })
  @IsOptional()
  @IsNumber()
  unitAmountCents?: number;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsNumber()
  perUnitAmountCents?: number;

  @ApiProperty({ required: false, example: 'gb' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  includedQuantity?: number;

  @ApiProperty({ required: false, enum: ['one_time', 'monthly', 'annual'], default: 'monthly' })
  @IsOptional()
  @IsEnum(['one_time', 'monthly', 'annual'])
  interval?: 'one_time' | 'monthly' | 'annual';
}

// ==================== Credit ====================

export class AddCreditDto {
  @ApiProperty({ example: 5000, description: 'Amount in cents' })
  @IsNumber()
  @Min(1)
  amountCents: number;

  @ApiProperty({ required: false, example: 'Promotional credit' })
  @IsOptional()
  @IsString()
  description?: string;
}




