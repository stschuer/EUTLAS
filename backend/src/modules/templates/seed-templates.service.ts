import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Template, TemplateDocument, TemplateType, TemplateCategory, TemplateVisibility } from './schemas/template.schema';

@Injectable()
export class SeedTemplatesService {
  private readonly logger = new Logger(SeedTemplatesService.name);

  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
  ) {}

  async seedDefaultTemplates(userId: string): Promise<void> {
    this.logger.log('Seeding default templates...');

    // Check if templates already exist
    const existingCount = await this.templateModel.countDocuments({ isSystem: true });
    if (existingCount > 0) {
      this.logger.log(`${existingCount} system templates already exist. Skipping seed.`);
      return;
    }

    const dashboardTemplates = this.getDashboardTemplates();
    const schemaTemplates = this.getSchemaTemplates();

    const allTemplates = [...dashboardTemplates, ...schemaTemplates];

    for (const template of allTemplates) {
      await this.templateModel.create({
        ...template,
        createdBy: userId,
        isSystem: true,
        isActive: true,
        version: 1,
        usageCount: 0,
      });
    }

    this.logger.log(`Seeded ${allTemplates.length} default templates`);
  }

  private getDashboardTemplates() {
    return [
      {
        name: 'Cluster Overview Dashboard',
        description: 'Essential metrics for cluster monitoring including CPU, memory, connections, and operations',
        type: TemplateType.DASHBOARD,
        category: TemplateCategory.MONITORING,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['monitoring', 'cluster', 'overview'],
        isFeatured: true,
        content: {
          widgets: [
            {
              id: 'cpu-gauge',
              title: 'CPU Usage',
              type: 'gauge',
              query: { metric: 'cpu_percent', aggregation: 'avg' },
              position: { x: 0, y: 0, width: 3, height: 2 },
              options: { unit: '%', thresholds: [{ value: 80, color: 'red' }] },
            },
            {
              id: 'memory-gauge',
              title: 'Memory Usage',
              type: 'gauge',
              query: { metric: 'memory_percent', aggregation: 'avg' },
              position: { x: 3, y: 0, width: 3, height: 2 },
              options: { unit: '%', thresholds: [{ value: 80, color: 'red' }] },
            },
            {
              id: 'connections-stat',
              title: 'Active Connections',
              type: 'stat',
              query: { metric: 'connections', aggregation: 'max' },
              position: { x: 6, y: 0, width: 3, height: 2 },
            },
            {
              id: 'ops-stat',
              title: 'Operations/sec',
              type: 'stat',
              query: { metric: 'operations_per_sec', aggregation: 'avg' },
              position: { x: 9, y: 0, width: 3, height: 2 },
            },
            {
              id: 'cpu-chart',
              title: 'CPU Over Time',
              type: 'line_chart',
              query: { metric: 'cpu_percent' },
              position: { x: 0, y: 2, width: 6, height: 3 },
            },
            {
              id: 'memory-chart',
              title: 'Memory Over Time',
              type: 'line_chart',
              query: { metric: 'memory_percent' },
              position: { x: 6, y: 2, width: 6, height: 3 },
            },
          ],
        },
      },
      {
        name: 'Performance Dashboard',
        description: 'Query performance and operations metrics for database optimization',
        type: TemplateType.DASHBOARD,
        category: TemplateCategory.ANALYTICS,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['performance', 'analytics', 'queries'],
        isFeatured: true,
        content: {
          widgets: [
            {
              id: 'query-time',
              title: 'Avg Query Time',
              type: 'stat',
              query: { metric: 'query_time_avg', aggregation: 'avg' },
              position: { x: 0, y: 0, width: 4, height: 2 },
              options: { unit: 'ms' },
            },
            {
              id: 'ops-chart',
              title: 'Operations Breakdown',
              type: 'area_chart',
              metrics: ['reads', 'writes', 'commands'],
              position: { x: 0, y: 2, width: 12, height: 4 },
              options: { stacked: true },
            },
          ],
        },
      },
      {
        name: 'Storage Dashboard',
        description: 'Storage utilization and disk I/O metrics',
        type: TemplateType.DASHBOARD,
        category: TemplateCategory.MONITORING,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['storage', 'disk', 'capacity'],
        content: {
          widgets: [
            {
              id: 'storage-gauge',
              title: 'Storage Used',
              type: 'gauge',
              query: { metric: 'storage_percent', aggregation: 'avg' },
              position: { x: 0, y: 0, width: 4, height: 2 },
              options: { unit: '%', thresholds: [{ value: 90, color: 'red' }] },
            },
            {
              id: 'network-chart',
              title: 'Network I/O',
              type: 'line_chart',
              metrics: ['network_in', 'network_out'],
              position: { x: 0, y: 2, width: 12, height: 4 },
              options: { showLegend: true },
            },
          ],
        },
      },
    ];
  }

  private getSchemaTemplates() {
    return [
      {
        name: 'User Document Schema',
        description: 'Standard schema for user/account documents with email validation',
        type: TemplateType.SCHEMA,
        category: TemplateCategory.VALIDATION,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['user', 'authentication', 'validation'],
        isFeatured: true,
        content: {
          bsonType: 'object',
          required: ['email', 'createdAt'],
          properties: {
            email: { bsonType: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
            name: { bsonType: 'string', minLength: 1, maxLength: 100 },
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: 'date' },
            isActive: { bsonType: 'bool' },
            roles: { bsonType: 'array', items: { bsonType: 'string' } },
          },
        },
      },
      {
        name: 'Product Catalog Schema',
        description: 'E-commerce product schema with pricing and inventory tracking',
        type: TemplateType.SCHEMA,
        category: TemplateCategory.VALIDATION,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['ecommerce', 'product', 'catalog'],
        isFeatured: true,
        content: {
          bsonType: 'object',
          required: ['name', 'price', 'sku'],
          properties: {
            name: { bsonType: 'string', minLength: 1 },
            description: { bsonType: 'string' },
            sku: { bsonType: 'string', pattern: '^[A-Z0-9-]+$' },
            price: { bsonType: 'number', minimum: 0 },
            currency: { bsonType: 'string', enum: ['EUR', 'USD', 'GBP'] },
            inventory: { bsonType: 'int', minimum: 0 },
            categories: { bsonType: 'array', items: { bsonType: 'string' } },
            isActive: { bsonType: 'bool' },
          },
        },
      },
      {
        name: 'Event Log Schema',
        description: 'Audit log schema for tracking user actions and system events',
        type: TemplateType.SCHEMA,
        category: TemplateCategory.COMPLIANCE,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['audit', 'logging', 'compliance'],
        content: {
          bsonType: 'object',
          required: ['eventType', 'timestamp'],
          properties: {
            eventType: { bsonType: 'string' },
            timestamp: { bsonType: 'date' },
            userId: { bsonType: 'objectId' },
            resourceType: { bsonType: 'string' },
            resourceId: { bsonType: 'string' },
            action: { bsonType: 'string', enum: ['CREATE', 'UPDATE', 'DELETE', 'VIEW'] },
            metadata: { bsonType: 'object' },
            ipAddress: { bsonType: 'string' },
          },
        },
      },
      {
        name: 'Time Series Schema',
        description: 'Schema for time-series metrics and monitoring data',
        type: TemplateType.SCHEMA,
        category: TemplateCategory.MONITORING,
        visibility: TemplateVisibility.GLOBAL,
        tags: ['timeseries', 'metrics', 'monitoring'],
        content: {
          bsonType: 'object',
          required: ['timestamp', 'value'],
          properties: {
            timestamp: { bsonType: 'date' },
            value: { bsonType: 'number' },
            metric: { bsonType: 'string' },
            tags: { bsonType: 'object' },
            unit: { bsonType: 'string' },
          },
        },
      },
    ];
  }
}
