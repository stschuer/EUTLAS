import { ClusterPlanDetails } from '../types';

export const CLUSTER_PLANS: Record<string, ClusterPlanDetails> = {
  DEV: {
    plan: 'DEV',
    name: 'Development',
    description: 'Perfect for development and testing',
    ramMB: 512,
    storageSizeGB: 5,
    pricePerMonth: 9,
  },
  SMALL: {
    plan: 'SMALL',
    name: 'Small Production',
    description: 'Small production workloads',
    ramMB: 1024,
    storageSizeGB: 20,
    pricePerMonth: 29,
  },
  MEDIUM: {
    plan: 'MEDIUM',
    name: 'Medium Production',
    description: 'Medium production workloads with replica set',
    ramMB: 2048,
    storageSizeGB: 50,
    pricePerMonth: 59,
    recommended: true,
  },
  LARGE: {
    plan: 'LARGE',
    name: 'Large Production',
    description: 'Large production workloads with 3-node replica set',
    ramMB: 4096,
    storageSizeGB: 100,
    pricePerMonth: 119,
  },
  XLARGE: {
    plan: 'XLARGE',
    name: 'XLarge Production',
    description: 'High-performance workloads with 3-node replica set',
    ramMB: 8192,
    storageSizeGB: 200,
    pricePerMonth: 229,
  },
  XXL: {
    plan: 'XXL',
    name: 'Enterprise',
    description: 'Enterprise-grade with 16GB RAM and 500GB storage',
    ramMB: 16384,
    storageSizeGB: 500,
    pricePerMonth: 449,
  },
  XXXL: {
    plan: 'XXXL',
    name: 'Enterprise Plus',
    description: 'Enterprise Plus with 32GB RAM and 1TB storage',
    ramMB: 32768,
    storageSizeGB: 1000,
    pricePerMonth: 849,
  },
  DEDICATED_L: {
    plan: 'DEDICATED_L',
    name: 'Dedicated Large',
    description: 'Dedicated hardware with 64GB RAM and 2TB NVMe storage',
    ramMB: 65536,
    storageSizeGB: 2000,
    pricePerMonth: 1599,
  },
  DEDICATED_XL: {
    plan: 'DEDICATED_XL',
    name: 'Dedicated XLarge',
    description: 'Dedicated hardware with 128GB RAM and 4TB NVMe storage',
    ramMB: 131072,
    storageSizeGB: 4000,
    pricePerMonth: 2999,
  },
};

export const DEFAULT_MONGO_VERSION = '7.0';

export const SUPPORTED_MONGO_VERSIONS = ['6.0', '7.0'];





