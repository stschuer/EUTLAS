import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Interval } from '@nestjs/schedule';
import { Metric, MetricDocument, MetricType } from './schemas/metric.schema';
import { Cluster, ClusterDocument } from '../clusters/schemas/cluster.schema';

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
}

export interface ClusterMetrics {
  cpu: MetricDataPoint[];
  memory: MetricDataPoint[];
  storage: { used: MetricDataPoint[]; available: MetricDataPoint[] };
  connections: { current: MetricDataPoint[]; available: MetricDataPoint[] };
  operations: {
    insert: MetricDataPoint[];
    query: MetricDataPoint[];
    update: MetricDataPoint[];
    delete: MetricDataPoint[];
  };
  network: { in: MetricDataPoint[]; out: MetricDataPoint[] };
}

export interface CurrentMetrics {
  cpu: number;
  memory: number;
  storageUsed: number;
  storageAvailable: number;
  connectionsCurrent: number;
  connectionsAvailable: number;
  operationsPerSec: number;
  networkIn: number;
  networkOut: number;
  lastUpdated: Date;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectModel(Metric.name) private metricModel: Model<MetricDocument>,
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
  ) {}

  // Collect metrics every 30 seconds in development
  @Interval(30000)
  async collectMetrics() {
    try {
      const clusters = await this.clusterModel.find({
        status: { $in: ['ready', 'degraded'] },
      }).exec();

      for (const cluster of clusters) {
        await this.collectClusterMetrics(cluster.id);
      }
    } catch (error) {
      this.logger.error('Error collecting metrics', error);
    }
  }

  async collectClusterMetrics(clusterId: string): Promise<void> {
    const timestamp = new Date();

    // In development, generate simulated metrics
    const metrics = this.generateSimulatedMetrics();

    const documents = [
      { clusterId, type: 'cpu_usage' as MetricType, value: metrics.cpu, unit: 'percent', timestamp },
      { clusterId, type: 'memory_usage' as MetricType, value: metrics.memory, unit: 'percent', timestamp },
      { clusterId, type: 'storage_used' as MetricType, value: metrics.storageUsed, unit: 'bytes', timestamp },
      { clusterId, type: 'storage_available' as MetricType, value: metrics.storageAvailable, unit: 'bytes', timestamp },
      { clusterId, type: 'connections_current' as MetricType, value: metrics.connectionsCurrent, unit: 'count', timestamp },
      { clusterId, type: 'connections_available' as MetricType, value: metrics.connectionsAvailable, unit: 'count', timestamp },
      { clusterId, type: 'operations_insert' as MetricType, value: metrics.opsInsert, unit: 'count', timestamp },
      { clusterId, type: 'operations_query' as MetricType, value: metrics.opsQuery, unit: 'count', timestamp },
      { clusterId, type: 'operations_update' as MetricType, value: metrics.opsUpdate, unit: 'count', timestamp },
      { clusterId, type: 'operations_delete' as MetricType, value: metrics.opsDelete, unit: 'count', timestamp },
      { clusterId, type: 'network_in' as MetricType, value: metrics.networkIn, unit: 'bytes', timestamp },
      { clusterId, type: 'network_out' as MetricType, value: metrics.networkOut, unit: 'bytes', timestamp },
    ];

    await this.metricModel.insertMany(documents);
    this.logger.debug(`Collected metrics for cluster ${clusterId}`);
  }

  async getMetrics(
    clusterId: string,
    period: '1h' | '6h' | '24h' | '7d' | '30d' = '24h',
  ): Promise<ClusterMetrics> {
    const startTime = this.getStartTime(period);

    const metrics = await this.metricModel
      .find({
        clusterId,
        timestamp: { $gte: startTime },
      })
      .sort({ timestamp: 1 })
      .exec();

    return this.groupMetrics(metrics);
  }

  async getCurrentMetrics(clusterId: string): Promise<CurrentMetrics | null> {
    // Get the latest metrics for each type
    const types: MetricType[] = [
      'cpu_usage', 'memory_usage', 'storage_used', 'storage_available',
      'connections_current', 'connections_available',
      'operations_insert', 'operations_query', 'operations_update', 'operations_delete',
      'network_in', 'network_out',
    ];

    const latestMetrics = await Promise.all(
      types.map(type =>
        this.metricModel
          .findOne({ clusterId, type })
          .sort({ timestamp: -1 })
          .exec()
      )
    );

    const metricsMap: Record<string, number> = {};
    let lastUpdated = new Date(0);

    latestMetrics.forEach((metric, index) => {
      if (metric) {
        metricsMap[types[index]] = metric.value;
        if (metric.timestamp > lastUpdated) {
          lastUpdated = metric.timestamp;
        }
      }
    });

    if (Object.keys(metricsMap).length === 0) {
      return null;
    }

    const opsPerSec = (
      (metricsMap['operations_insert'] || 0) +
      (metricsMap['operations_query'] || 0) +
      (metricsMap['operations_update'] || 0) +
      (metricsMap['operations_delete'] || 0)
    );

    return {
      cpu: metricsMap['cpu_usage'] || 0,
      memory: metricsMap['memory_usage'] || 0,
      storageUsed: metricsMap['storage_used'] || 0,
      storageAvailable: metricsMap['storage_available'] || 0,
      connectionsCurrent: metricsMap['connections_current'] || 0,
      connectionsAvailable: metricsMap['connections_available'] || 0,
      operationsPerSec: opsPerSec,
      networkIn: metricsMap['network_in'] || 0,
      networkOut: metricsMap['network_out'] || 0,
      lastUpdated,
    };
  }

  async getAggregatedMetrics(
    clusterId: string,
    metricType: MetricType,
    period: '1h' | '6h' | '24h' | '7d' | '30d',
    aggregation: 'avg' | 'max' | 'min' | 'sum' = 'avg',
  ): Promise<MetricDataPoint[]> {
    const startTime = this.getStartTime(period);
    const bucketSize = this.getBucketSize(period);

    const pipeline: any[] = [
      {
        $match: {
          clusterId,
          type: metricType,
          timestamp: { $gte: startTime },
        },
      },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, bucketSize] },
              ],
            },
          },
          value: { [`$${aggregation}`]: '$value' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          timestamp: '$_id',
          value: { $round: ['$value', 2] },
        },
      },
    ];

    return this.metricModel.aggregate(pipeline).exec();
  }

  private getStartTime(period: string): Date {
    const now = new Date();
    switch (period) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '6h':
        return new Date(now.getTime() - 6 * 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private getBucketSize(period: string): number {
    switch (period) {
      case '1h':
        return 60 * 1000; // 1 minute
      case '6h':
        return 5 * 60 * 1000; // 5 minutes
      case '24h':
        return 15 * 60 * 1000; // 15 minutes
      case '7d':
        return 60 * 60 * 1000; // 1 hour
      case '30d':
        return 6 * 60 * 60 * 1000; // 6 hours
      default:
        return 15 * 60 * 1000;
    }
  }

  private groupMetrics(metrics: MetricDocument[]): ClusterMetrics {
    const result: ClusterMetrics = {
      cpu: [],
      memory: [],
      storage: { used: [], available: [] },
      connections: { current: [], available: [] },
      operations: { insert: [], query: [], update: [], delete: [] },
      network: { in: [], out: [] },
    };

    for (const metric of metrics) {
      const point = { timestamp: metric.timestamp, value: metric.value };

      switch (metric.type) {
        case 'cpu_usage':
          result.cpu.push(point);
          break;
        case 'memory_usage':
          result.memory.push(point);
          break;
        case 'storage_used':
          result.storage.used.push(point);
          break;
        case 'storage_available':
          result.storage.available.push(point);
          break;
        case 'connections_current':
          result.connections.current.push(point);
          break;
        case 'connections_available':
          result.connections.available.push(point);
          break;
        case 'operations_insert':
          result.operations.insert.push(point);
          break;
        case 'operations_query':
          result.operations.query.push(point);
          break;
        case 'operations_update':
          result.operations.update.push(point);
          break;
        case 'operations_delete':
          result.operations.delete.push(point);
          break;
        case 'network_in':
          result.network.in.push(point);
          break;
        case 'network_out':
          result.network.out.push(point);
          break;
      }
    }

    return result;
  }

  private generateSimulatedMetrics() {
    // Generate realistic-looking random metrics
    const baseLoad = 20 + Math.random() * 30; // 20-50% base load
    const spike = Math.random() > 0.9 ? Math.random() * 30 : 0; // Occasional spike

    return {
      cpu: Math.min(100, baseLoad + spike + (Math.random() - 0.5) * 10),
      memory: 40 + Math.random() * 30 + (Math.random() - 0.5) * 5,
      storageUsed: Math.floor(2 * 1024 * 1024 * 1024 + Math.random() * 1024 * 1024 * 100), // ~2GB + variation
      storageAvailable: Math.floor(20 * 1024 * 1024 * 1024), // 20GB
      connectionsCurrent: Math.floor(5 + Math.random() * 20),
      connectionsAvailable: 100,
      opsInsert: Math.floor(Math.random() * 50),
      opsQuery: Math.floor(50 + Math.random() * 200),
      opsUpdate: Math.floor(Math.random() * 30),
      opsDelete: Math.floor(Math.random() * 10),
      networkIn: Math.floor(Math.random() * 1024 * 1024), // Up to 1MB/s
      networkOut: Math.floor(Math.random() * 2 * 1024 * 1024), // Up to 2MB/s
    };
  }
}





