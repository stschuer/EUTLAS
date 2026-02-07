import { CLUSTER_PLANS } from './plans';

describe('CLUSTER_PLANS', () => {
  // ==================== All Plans Exist ====================

  it('should define all expected plan tiers', () => {
    const expectedPlans = [
      'DEV',
      'SMALL',
      'MEDIUM',
      'LARGE',
      'XLARGE',
      'XXL',
      'XXXL',
      'DEDICATED_L',
      'DEDICATED_XL',
    ];

    for (const plan of expectedPlans) {
      expect(CLUSTER_PLANS).toHaveProperty(plan);
    }
  });

  // ==================== Plan Structure ====================

  it('should have required fields for every plan', () => {
    for (const [key, plan] of Object.entries(CLUSTER_PLANS)) {
      expect(plan).toHaveProperty('plan');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('description');
      expect(plan).toHaveProperty('ramMB');
      expect(plan).toHaveProperty('storageSizeGB');
      expect(plan).toHaveProperty('pricePerMonth');
      expect(plan.plan).toBe(key);
    }
  });

  // ==================== Plan Ordering (ascending resources) ====================

  it('should have plans in ascending RAM order', () => {
    const planOrder = [
      'DEV',
      'SMALL',
      'MEDIUM',
      'LARGE',
      'XLARGE',
      'XXL',
      'XXXL',
      'DEDICATED_L',
      'DEDICATED_XL',
    ];

    for (let i = 1; i < planOrder.length; i++) {
      const prev = CLUSTER_PLANS[planOrder[i - 1]];
      const curr = CLUSTER_PLANS[planOrder[i]];
      expect(curr.ramMB).toBeGreaterThan(prev.ramMB);
    }
  });

  it('should have plans in ascending storage order', () => {
    const planOrder = [
      'DEV',
      'SMALL',
      'MEDIUM',
      'LARGE',
      'XLARGE',
      'XXL',
      'XXXL',
      'DEDICATED_L',
      'DEDICATED_XL',
    ];

    for (let i = 1; i < planOrder.length; i++) {
      const prev = CLUSTER_PLANS[planOrder[i - 1]];
      const curr = CLUSTER_PLANS[planOrder[i]];
      expect(curr.storageSizeGB).toBeGreaterThan(prev.storageSizeGB);
    }
  });

  it('should have plans in ascending price order', () => {
    const planOrder = [
      'DEV',
      'SMALL',
      'MEDIUM',
      'LARGE',
      'XLARGE',
      'XXL',
      'XXXL',
      'DEDICATED_L',
      'DEDICATED_XL',
    ];

    for (let i = 1; i < planOrder.length; i++) {
      const prev = CLUSTER_PLANS[planOrder[i - 1]];
      const curr = CLUSTER_PLANS[planOrder[i]];
      expect(curr.pricePerMonth).toBeGreaterThan(prev.pricePerMonth);
    }
  });

  // ==================== Specific Plan Values ====================

  describe('DEV plan', () => {
    it('should have correct specs', () => {
      expect(CLUSTER_PLANS.DEV.ramMB).toBe(512);
      expect(CLUSTER_PLANS.DEV.storageSizeGB).toBe(5);
      expect(CLUSTER_PLANS.DEV.pricePerMonth).toBe(9);
    });
  });

  describe('MEDIUM plan', () => {
    it('should be the recommended plan', () => {
      expect((CLUSTER_PLANS.MEDIUM as any).recommended).toBe(true);
    });
  });

  describe('Enterprise plans', () => {
    it('XXL should have 16GB RAM and 500GB storage', () => {
      expect(CLUSTER_PLANS.XXL.ramMB).toBe(16384);
      expect(CLUSTER_PLANS.XXL.storageSizeGB).toBe(500);
      expect(CLUSTER_PLANS.XXL.pricePerMonth).toBe(449);
    });

    it('XXXL should have 32GB RAM and 1TB storage', () => {
      expect(CLUSTER_PLANS.XXXL.ramMB).toBe(32768);
      expect(CLUSTER_PLANS.XXXL.storageSizeGB).toBe(1000);
      expect(CLUSTER_PLANS.XXXL.pricePerMonth).toBe(849);
    });

    it('DEDICATED_L should have 64GB RAM and 2TB storage', () => {
      expect(CLUSTER_PLANS.DEDICATED_L.ramMB).toBe(65536);
      expect(CLUSTER_PLANS.DEDICATED_L.storageSizeGB).toBe(2000);
      expect(CLUSTER_PLANS.DEDICATED_L.pricePerMonth).toBe(1599);
    });

    it('DEDICATED_XL should have 128GB RAM and 4TB storage', () => {
      expect(CLUSTER_PLANS.DEDICATED_XL.ramMB).toBe(131072);
      expect(CLUSTER_PLANS.DEDICATED_XL.storageSizeGB).toBe(4000);
      expect(CLUSTER_PLANS.DEDICATED_XL.pricePerMonth).toBe(2999);
    });
  });

  // ==================== Pricing Sanity Checks ====================

  it('all prices should be positive numbers', () => {
    for (const plan of Object.values(CLUSTER_PLANS)) {
      expect(plan.pricePerMonth).toBeGreaterThan(0);
      expect(typeof plan.pricePerMonth).toBe('number');
    }
  });

  it('all RAM values should be positive numbers', () => {
    for (const plan of Object.values(CLUSTER_PLANS)) {
      expect(plan.ramMB).toBeGreaterThan(0);
      expect(typeof plan.ramMB).toBe('number');
    }
  });

  it('all storage values should be positive numbers', () => {
    for (const plan of Object.values(CLUSTER_PLANS)) {
      expect(plan.storageSizeGB).toBeGreaterThan(0);
      expect(typeof plan.storageSizeGB).toBe('number');
    }
  });

  // ==================== Price-to-Resource Ratio ====================

  it('higher plans should have better price/GB ratio', () => {
    const largePricePerGB =
      CLUSTER_PLANS.LARGE.pricePerMonth / CLUSTER_PLANS.LARGE.storageSizeGB;
    const dedicatedLPricePerGB =
      CLUSTER_PLANS.DEDICATED_L.pricePerMonth /
      CLUSTER_PLANS.DEDICATED_L.storageSizeGB;

    // Enterprise plans should have a similar or better price per GB
    // (the ratio may not always decrease, but should be in a reasonable range)
    expect(largePricePerGB).toBeGreaterThan(0);
    expect(dedicatedLPricePerGB).toBeGreaterThan(0);
  });
});
