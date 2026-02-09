import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Price, PriceDocument } from '../schemas/price.schema';
import { UsageType } from '../schemas/usage-record.schema';
import { StripeService } from './stripe.service';

// Default prices (in cents, EUR)
const DEFAULT_PRICES = [
  // Plans - Standard
  { priceCode: 'plan_dev', name: 'Development Plan', category: 'plan', unitAmountCents: 900, interval: 'monthly', description: '512MB RAM, 5GB Storage' },
  { priceCode: 'plan_small', name: 'Small Plan', category: 'plan', unitAmountCents: 2900, interval: 'monthly', description: '1GB RAM, 20GB Storage' },
  { priceCode: 'plan_medium', name: 'Medium Plan', category: 'plan', unitAmountCents: 5900, interval: 'monthly', description: '2GB RAM, 50GB Storage, Replica Set' },
  { priceCode: 'plan_large', name: 'Large Plan', category: 'plan', unitAmountCents: 11900, interval: 'monthly', description: '4GB RAM, 100GB Storage, Replica Set' },
  { priceCode: 'plan_xlarge', name: 'XLarge Plan', category: 'plan', unitAmountCents: 22900, interval: 'monthly', description: '8GB RAM, 200GB Storage, Replica Set' },
  
  // Plans - Enterprise
  { priceCode: 'plan_xxl', name: 'Enterprise Plan', category: 'plan', unitAmountCents: 44900, interval: 'monthly', description: '16GB RAM, 500GB Storage, 3-node Replica Set' },
  { priceCode: 'plan_xxxl', name: 'Enterprise Plus Plan', category: 'plan', unitAmountCents: 84900, interval: 'monthly', description: '32GB RAM, 1TB Storage, 3-node Replica Set' },
  { priceCode: 'plan_dedicated_l', name: 'Dedicated Large', category: 'plan', unitAmountCents: 159900, interval: 'monthly', description: '64GB RAM, 2TB NVMe, Dedicated Hardware' },
  { priceCode: 'plan_dedicated_xl', name: 'Dedicated XLarge', category: 'plan', unitAmountCents: 299900, interval: 'monthly', description: '128GB RAM, 4TB NVMe, Dedicated Hardware' },
  
  // Plans - Annual (20% discount)
  { priceCode: 'plan_dev_annual', name: 'Development Plan (Annual)', category: 'plan', unitAmountCents: 720, interval: 'annual', description: '512MB RAM, 5GB Storage - 20% annual discount' },
  { priceCode: 'plan_small_annual', name: 'Small Plan (Annual)', category: 'plan', unitAmountCents: 2320, interval: 'annual', description: '1GB RAM, 20GB Storage - 20% annual discount' },
  { priceCode: 'plan_medium_annual', name: 'Medium Plan (Annual)', category: 'plan', unitAmountCents: 4720, interval: 'annual', description: '2GB RAM, 50GB Storage - 20% annual discount' },
  { priceCode: 'plan_large_annual', name: 'Large Plan (Annual)', category: 'plan', unitAmountCents: 9520, interval: 'annual', description: '4GB RAM, 100GB Storage - 20% annual discount' },
  { priceCode: 'plan_xlarge_annual', name: 'XLarge Plan (Annual)', category: 'plan', unitAmountCents: 18320, interval: 'annual', description: '8GB RAM, 200GB Storage - 20% annual discount' },
  { priceCode: 'plan_xxl_annual', name: 'Enterprise Plan (Annual)', category: 'plan', unitAmountCents: 35920, interval: 'annual', description: '16GB RAM, 500GB Storage - 20% annual discount' },
  { priceCode: 'plan_xxxl_annual', name: 'Enterprise Plus Plan (Annual)', category: 'plan', unitAmountCents: 67920, interval: 'annual', description: '32GB RAM, 1TB Storage - 20% annual discount' },
  
  // Usage-based pricing
  { priceCode: 'usage_cluster_hours', name: 'Cluster Hours', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 1, unit: 'hour', description: 'Per hour of cluster runtime (included in plan)' },
  { priceCode: 'usage_storage_gb', name: 'Storage', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 25, unit: 'gb-month', description: 'Storage beyond plan allocation' },
  { priceCode: 'usage_transfer_gb', name: 'Data Transfer', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 10, unit: 'gb', description: 'Data transfer out', includedQuantity: 10 },
  { priceCode: 'usage_backup_gb', name: 'Backup Storage', category: 'usage', pricingModel: 'per_unit', perUnitAmountCents: 5, unit: 'gb-month', description: 'Backup storage' },
  
  // Addons
  { priceCode: 'addon_dedicated_support', name: 'Dedicated Support', category: 'addon', unitAmountCents: 9900, interval: 'monthly', description: '24/7 dedicated support with 99.95% SLA' },
  { priceCode: 'addon_advanced_security', name: 'Advanced Security', category: 'addon', unitAmountCents: 4900, interval: 'monthly', description: 'Encryption at rest, X.509 auth, advanced audit' },
  { priceCode: 'addon_read_replicas', name: 'Read Replicas', category: 'addon', unitAmountCents: 7900, interval: 'monthly', description: 'Additional read-only replica node' },
];

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private priceCache: Map<string, Price> = new Map();

  constructor(
    @InjectModel(Price.name) private priceModel: Model<PriceDocument>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPrices();
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv !== 'test') {
      await this.syncStripePrices();
    }
    await this.loadPriceCache();
  }

  private async seedDefaultPrices(): Promise<void> {
    for (const priceData of DEFAULT_PRICES) {
      await this.priceModel.updateOne(
        { priceCode: priceData.priceCode },
        {
          $setOnInsert: {
            ...priceData,
            currency: 'EUR',
            pricingModel: priceData.pricingModel || 'flat',
            active: true,
          },
        },
        { upsert: true },
      ).exec();
    }
    this.logger.log(`Seeded ${DEFAULT_PRICES.length} default prices`);
  }

  /**
   * Sync local prices with Stripe - create products and prices in Stripe
   * for any that don't have a stripeProductId/stripePriceId yet.
   */
  private async syncStripePrices(): Promise<void> {
    if (!this.stripeService.configured) {
      this.logger.log('Stripe not configured - skipping price sync');
      return;
    }

    const prices = await this.priceModel.find({ active: true }).exec();

    for (const price of prices) {
      try {
        // Skip if already synced
        if (price.stripeProductId && price.stripePriceId) {
          continue;
        }

        // Create Stripe product if needed
        if (!price.stripeProductId) {
          const product = await this.stripeService.createProduct({
            name: `EUTLAS - ${price.name}`,
            description: price.description,
            metadata: {
              eutlas_price_code: price.priceCode,
              category: price.category,
            },
          });

          if (product) {
            price.stripeProductId = product.id;
            this.logger.log(`Created Stripe product for ${price.priceCode}: ${product.id}`);
          }
        }

        // Create Stripe price if needed
        if (price.stripeProductId && !price.stripePriceId) {
          const unitAmount = price.unitAmountCents || price.perUnitAmountCents || 0;

          // Only create a price in Stripe for items with an amount
          if (unitAmount > 0) {
            const isRecurring = price.interval === 'monthly' || price.interval === 'annual';
            const stripePrice = await this.stripeService.createPrice({
              productId: price.stripeProductId,
              unitAmountCents: unitAmount,
              currency: 'eur',
              recurring: isRecurring
                ? { interval: price.interval === 'annual' ? 'year' : 'month' }
                : undefined,
              metadata: {
                eutlas_price_code: price.priceCode,
                category: price.category,
              },
            });

            if (stripePrice) {
              price.stripePriceId = stripePrice.id;
              this.logger.log(`Created Stripe price for ${price.priceCode}: ${stripePrice.id}`);
            }
          }
        }

        // Save updated price
        if (price.isModified()) {
          await price.save();
        }
      } catch (error: any) {
        this.logger.error(`Failed to sync Stripe price for ${price.priceCode}: ${error.message}`);
        // Continue with other prices even if one fails
      }
    }

    this.logger.log('Stripe price sync completed');
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
