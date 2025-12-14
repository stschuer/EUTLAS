import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Price, PriceDocument } from '../schemas/price.schema';
import { UsageType } from '../schemas/usage-record.schema';

// Default prices (in cents, EUR)
const DEFAULT_PRICES = [
  // Plans
  { priceCode: 'plan_dev', name: 'Development Plan', category: 'plan', unitAmountCents: 900, interval: 'monthly', description: '512MB RAM, 5GB Storage' },
  { priceCode: 'plan_small', name: 'Small Plan', category: 'plan', unitAmountCents: 2900, interval: 'monthly', description: '1GB RAM, 20GB Storage' },
  { priceCode: 'plan_medium', name: 'Medium Plan', category: 'plan', unitAmountCents: 5900, interval: 'monthly', description: '2GB RAM, 50GB Storage' },
  { priceCode: 'plan_large', name: 'Large Plan', category: 'plan', unitAmountCents: 11900, interval: 'monthly', description: '4GB RAM, 100GB Storage' },
  { priceCode: 'plan_xlarge', name: 'XLarge Plan', category: 'plan', unitAmountCents: 22900, interval: 'monthly', description: '8GB RAM, 200GB Storage' },
  
  // Usage-based pricing
  { priceCode: 'usage_cluster_hours', name: 'Cluster Hours', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 1, unit: 'hour', description: 'Per hour of cluster runtime (included in plan)' },
  { priceCode: 'usage_storage_gb', name: 'Storage', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 25, unit: 'gb-month', description: 'Storage beyond plan allocation' },
  { priceCode: 'usage_transfer_gb', name: 'Data Transfer', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 10, unit: 'gb', description: 'Data transfer out', includedQuantity: 10 },
  { priceCode: 'usage_backup_gb', name: 'Backup Storage', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 5, unit: 'gb-month', description: 'Backup storage' },
  
  // Addons
  { priceCode: 'addon_dedicated_support', name: 'Dedicated Support', category: 'addon', unitAmountCents: 9900, interval: 'monthly', description: '24/7 dedicated support' },
  { priceCode: 'addon_advanced_security', name: 'Advanced Security', category: 'addon', unitAmountCents: 4900, interval: 'monthly', description: 'Advanced security features' },
];

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private priceCache: Map<string, Price> = new Map();

  constructor(
    @InjectModel(Price.name) private priceModel: Model<PriceDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPrices();
    await this.loadPriceCache();
  }

  private async seedDefaultPrices(): Promise<void> {
    for (const priceData of DEFAULT_PRICES) {
      const existing = await this.priceModel.findOne({ priceCode: priceData.priceCode }).exec();
      if (!existing) {
        const price = new this.priceModel({
          ...priceData,
          currency: 'EUR',
          pricingModel: priceData.pricingModel || 'flat',
          active: true,
        });
        await price.save();
        this.logger.log(`Seeded price: ${priceData.priceCode}`);
      }
    }
  }

  private async loadPriceCache(): Promise<void> {
    const prices = await this.priceModel.find({ active: true }).exec();
    this.priceCache.clear();
    for (const price of prices) {
      this.priceCache.set(price.priceCode, price);
    }
    this.logger.log(`Loaded ${prices.length} prices into cache`);
  }

  // ==================== Price Queries ====================

  async getAllPrices(): Promise<Price[]> {
    return this.priceModel.find({ active: true }).exec();
  }

  async getPriceByCode(priceCode: string): Promise<Price | null> {
    // Check cache first
    if (this.priceCache.has(priceCode)) {
      return this.priceCache.get(priceCode)!;
    }
    return this.priceModel.findOne({ priceCode, active: true }).exec();
  }

  async getPlanPrice(planType: string): Promise<Price | null> {
    const priceCode = `plan_${planType.toLowerCase()}`;
    return this.getPriceByCode(priceCode);
  }

  async getPriceForUsageType(usageType: UsageType): Promise<Price | null> {
    const mapping: Record<UsageType, string> = {
      cluster_hours: 'usage_cluster_hours',
      storage_gb_hours: 'usage_storage_gb',
      data_transfer_gb: 'usage_transfer_gb',
      backup_storage_gb: 'usage_backup_gb',
      iops: 'usage_iops',
      connections: 'usage_connections',
    };
    const priceCode = mapping[usageType];
    return priceCode ? this.getPriceByCode(priceCode) : null;
  }

  async getPricesByCategory(category: 'plan' | 'usage' | 'addon'): Promise<Price[]> {
    return this.priceModel.find({ category, active: true }).exec();
  }

  // ==================== Price Management ====================

  async createPrice(data: Partial<Price>): Promise<Price> {
    const price = new this.priceModel({
      ...data,
      currency: data.currency || 'EUR',
      active: true,
    });
    await price.save();
    this.priceCache.set(price.priceCode, price);
    return price;
  }

  async updatePrice(priceCode: string, data: Partial<Price>): Promise<Price | null> {
    const price = await this.priceModel.findOneAndUpdate(
      { priceCode },
      { $set: data },
      { new: true },
    ).exec();

    if (price) {
      this.priceCache.set(priceCode, price);
    }
    return price;
  }

  async deactivatePrice(priceCode: string): Promise<void> {
    await this.priceModel.findOneAndUpdate(
      { priceCode },
      { $set: { active: false } },
    ).exec();
    this.priceCache.delete(priceCode);
  }

  // ==================== Price Calculation ====================

  calculateAmount(price: Price, quantity: number): number {
    switch (price.pricingModel) {
      case 'flat':
        return price.unitAmountCents || 0;
      
      case 'per_unit':
        const billableQuantity = Math.max(0, quantity - (price.includedQuantity || 0));
        return Math.round(billableQuantity * (price.perUnitAmountCents || 0));
      
      case 'tiered':
        return this.calculateTieredAmount(price, quantity);
      
      default:
        return 0;
    }
  }

  private calculateTieredAmount(price: Price, quantity: number): number {
    if (!price.tiers || price.tiers.length === 0) {
      return 0;
    }

    let total = 0;
    let remaining = quantity;

    for (const tier of price.tiers) {
      if (remaining <= 0) break;

      const tierLimit = tier.upTo ?? Infinity;
      const tierQuantity = Math.min(remaining, tierLimit);
      
      total += tierQuantity * tier.unitAmountCents;
      if (tier.flatAmountCents) {
        total += tier.flatAmountCents;
      }
      
      remaining -= tierQuantity;
    }

    return Math.round(total);
  }

  // ==================== Formatting ====================

  formatAmount(cents: number, currency: string = 'EUR'): string {
    const amount = cents / 100;
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
    }).format(amount);
  }
}




