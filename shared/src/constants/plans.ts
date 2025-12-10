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
    description: 'Medium production workloads',
    ramMB: 2048,
    storageSizeGB: 50,
    pricePerMonth: 59,
    recommended: true,
  },
  LARGE: {
    plan: 'LARGE',
    name: 'Large Production',
    description: 'Large production workloads',
    ramMB: 4096,
    storageSizeGB: 100,
    pricePerMonth: 119,
  },
  XLARGE: {
    plan: 'XLARGE',
    name: 'Enterprise',
    description: 'Enterprise-grade performance',
    ramMB: 8192,
    storageSizeGB: 200,
    pricePerMonth: 229,
  },
};

export const DEFAULT_MONGO_VERSION = '7.0';

export const SUPPORTED_MONGO_VERSIONS = ['6.0', '7.0'];


