import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;
  let mockPriceModel: any;
  let mockStripeService: any;

  beforeEach(() => {
    mockPriceModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn() }),
    };

    // Constructor mock for "new this.priceModel({...})"
    const MockModel: any = function (data: any) {
      return {
        ...data,
        save: jest.fn().mockResolvedValue(data),
        isModified: jest.fn().mockReturnValue(false),
      };
    };
    Object.assign(MockModel, mockPriceModel);

    mockStripeService = {
      configured: false,
    };

    service = new PricingService(MockModel, mockStripeService);
  });

  // ==================== calculateAmount - flat pricing ====================

  describe('calculateAmount - flat pricing', () => {
    it('should return unitAmountCents for flat pricing', () => {
      const price: any = {
        pricingModel: 'flat',
        unitAmountCents: 5900,
      };
      expect(service.calculateAmount(price, 1)).toBe(5900);
    });

    it('should return 0 when unitAmountCents is not set', () => {
      const price: any = {
        pricingModel: 'flat',
      };
      expect(service.calculateAmount(price, 1)).toBe(0);
    });

    it('should ignore quantity for flat pricing', () => {
      const price: any = {
        pricingModel: 'flat',
        unitAmountCents: 2900,
      };
      expect(service.calculateAmount(price, 100)).toBe(2900);
    });
  });

  // ==================== calculateAmount - per_unit pricing ====================

  describe('calculateAmount - per_unit pricing', () => {
    it('should multiply quantity by per-unit price', () => {
      const price: any = {
        pricingModel: 'per_unit',
        perUnitAmountCents: 25,
        includedQuantity: 0,
      };
      expect(service.calculateAmount(price, 100)).toBe(2500);
    });

    it('should subtract included quantity', () => {
      const price: any = {
        pricingModel: 'per_unit',
        perUnitAmountCents: 10,
        includedQuantity: 10,
      };
      // 50 - 10 = 40 billable units * 10 cents = 400
      expect(service.calculateAmount(price, 50)).toBe(400);
    });

    it('should return 0 when quantity is within included', () => {
      const price: any = {
        pricingModel: 'per_unit',
        perUnitAmountCents: 10,
        includedQuantity: 100,
      };
      expect(service.calculateAmount(price, 50)).toBe(0);
    });

    it('should handle missing includedQuantity (treated as 0)', () => {
      const price: any = {
        pricingModel: 'per_unit',
        perUnitAmountCents: 5,
      };
      expect(service.calculateAmount(price, 20)).toBe(100);
    });

    it('should round to nearest cent', () => {
      const price: any = {
        pricingModel: 'per_unit',
        perUnitAmountCents: 3,
        includedQuantity: 0,
      };
      expect(service.calculateAmount(price, 7)).toBe(21);
    });
  });

  // ==================== calculateAmount - tiered pricing ====================

  describe('calculateAmount - tiered pricing', () => {
    it('should calculate based on tiers', () => {
      const price: any = {
        pricingModel: 'tiered',
        tiers: [
          { upTo: 10, unitAmountCents: 50 },   // first 10 at 50¢
          { upTo: 50, unitAmountCents: 30 },   // next 50 at 30¢
          { upTo: null, unitAmountCents: 10 }, // rest at 10¢
        ],
      };

      // 10*50 + 50*30 + 40*10 = 500+1500+400 = 2400
      expect(service.calculateAmount(price, 100)).toBe(2400);
    });

    it('should return 0 for empty tiers', () => {
      const price: any = {
        pricingModel: 'tiered',
        tiers: [],
      };
      expect(service.calculateAmount(price, 100)).toBe(0);
    });

    it('should return 0 when tiers is undefined', () => {
      const price: any = {
        pricingModel: 'tiered',
      };
      expect(service.calculateAmount(price, 100)).toBe(0);
    });

    it('should include flat amounts from tiers', () => {
      const price: any = {
        pricingModel: 'tiered',
        tiers: [
          { upTo: 10, unitAmountCents: 50, flatAmountCents: 100 },
        ],
      };
      // 10*50 + 100 = 600
      expect(service.calculateAmount(price, 10)).toBe(600);
    });

    it('should handle zero quantity', () => {
      const price: any = {
        pricingModel: 'tiered',
        tiers: [
          { upTo: 10, unitAmountCents: 50 },
        ],
      };
      expect(service.calculateAmount(price, 0)).toBe(0);
    });
  });

  // ==================== calculateAmount - unknown pricing model ====================

  describe('calculateAmount - unknown pricing model', () => {
    it('should return 0 for unknown pricing models', () => {
      const price: any = {
        pricingModel: 'unknown',
        unitAmountCents: 9999,
      };
      expect(service.calculateAmount(price, 1)).toBe(0);
    });
  });

  // ==================== formatAmount ====================

  describe('formatAmount', () => {
    it('should format cents to EUR currency', () => {
      const result = service.formatAmount(5900);
      // German locale: "59,00 €" or similar
      expect(result).toContain('59');
      expect(result).toContain('€');
    });

    it('should format zero correctly', () => {
      const result = service.formatAmount(0);
      expect(result).toContain('0');
    });

    it('should handle large amounts', () => {
      const result = service.formatAmount(299900);
      expect(result).toContain('2.999');
    });

    it('should support custom currency', () => {
      const result = service.formatAmount(1000, 'USD');
      expect(result).toContain('$');
    });
  });

  // ==================== getPlanPrice mapping ====================

  describe('getPlanPrice', () => {
    it('should convert plan type to lowercase price code', async () => {
      const spy = jest.spyOn(service, 'getPriceByCode').mockResolvedValue(null);

      await service.getPlanPrice('MEDIUM');

      expect(spy).toHaveBeenCalledWith('plan_medium');
    });

    it('should convert enterprise plan types', async () => {
      const spy = jest.spyOn(service, 'getPriceByCode').mockResolvedValue(null);

      await service.getPlanPrice('XXL');
      expect(spy).toHaveBeenCalledWith('plan_xxl');

      await service.getPlanPrice('DEDICATED_L');
      expect(spy).toHaveBeenCalledWith('plan_dedicated_l');
    });
  });

  // ==================== getPriceForUsageType ====================

  describe('getPriceForUsageType', () => {
    it('should map cluster_hours to usage_cluster_hours', async () => {
      const spy = jest.spyOn(service, 'getPriceByCode').mockResolvedValue(null);

      await service.getPriceForUsageType('cluster_hours' as any);
      expect(spy).toHaveBeenCalledWith('usage_cluster_hours');
    });

    it('should map storage_gb_hours to usage_storage_gb', async () => {
      const spy = jest.spyOn(service, 'getPriceByCode').mockResolvedValue(null);

      await service.getPriceForUsageType('storage_gb_hours' as any);
      expect(spy).toHaveBeenCalledWith('usage_storage_gb');
    });

    it('should map data_transfer_gb to usage_transfer_gb', async () => {
      const spy = jest.spyOn(service, 'getPriceByCode').mockResolvedValue(null);

      await service.getPriceForUsageType('data_transfer_gb' as any);
      expect(spy).toHaveBeenCalledWith('usage_transfer_gb');
    });
  });
});
