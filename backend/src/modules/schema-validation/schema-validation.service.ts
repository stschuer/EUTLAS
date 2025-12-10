import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { CollectionSchema, CollectionSchemaDocument } from './schemas/collection-schema.schema';
import { CreateSchemaDto, UpdateSchemaDto, ValidateDocumentDto, GenerateSchemaDto } from './dto/schema-validation.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SchemaValidationService {
  private readonly logger = new Logger(SchemaValidationService.name);
  private ajv: Ajv;

  constructor(
    @InjectModel(CollectionSchema.name) private schemaModel: Model<CollectionSchemaDocument>,
    private auditService: AuditService,
  ) {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  async create(
    clusterId: string,
    dto: CreateSchemaDto,
    userId: string,
  ): Promise<CollectionSchema> {
    // Check for existing schema
    const existing = await this.schemaModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      database: dto.database,
      collection: dto.collection,
    });

    if (existing) {
      throw new ConflictException('Schema already exists for this collection');
    }

    // Validate the JSON schema itself
    try {
      this.ajv.compile(dto.jsonSchema);
    } catch (error) {
      throw new BadRequestException(`Invalid JSON Schema: ${error.message}`);
    }

    const schema = new this.schemaModel({
      clusterId: new Types.ObjectId(clusterId),
      database: dto.database,
      collection: dto.collection,
      jsonSchema: dto.jsonSchema,
      validationLevel: dto.validationLevel || 'strict',
      validationAction: dto.validationAction || 'error',
      description: dto.description,
      currentVersion: 1,
      history: [{
        version: 1,
        schema: dto.jsonSchema,
        changedAt: new Date(),
        changedBy: userId,
        comment: 'Initial schema creation',
      }],
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    });

    await schema.save();

    this.logger.log(`Created schema for ${dto.database}.${dto.collection} on cluster ${clusterId}`);
    return schema;
  }

  async findAllByCluster(clusterId: string): Promise<CollectionSchema[]> {
    return this.schemaModel
      .find({ clusterId: new Types.ObjectId(clusterId) })
      .sort({ database: 1, collection: 1 })
      .exec();
  }

  async findByCollection(
    clusterId: string,
    database: string,
    collection: string,
  ): Promise<CollectionSchema | null> {
    return this.schemaModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
      database,
      collection,
    }).exec();
  }

  async findById(schemaId: string): Promise<CollectionSchema | null> {
    return this.schemaModel.findById(schemaId).exec();
  }

  async update(
    schemaId: string,
    dto: UpdateSchemaDto,
    userId: string,
  ): Promise<CollectionSchema> {
    const schema = await this.schemaModel.findById(schemaId);
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    // If schema is being updated, validate and version it
    if (dto.jsonSchema) {
      try {
        this.ajv.compile(dto.jsonSchema);
      } catch (error) {
        throw new BadRequestException(`Invalid JSON Schema: ${error.message}`);
      }

      schema.currentVersion += 1;
      schema.history.push({
        version: schema.currentVersion,
        schema: dto.jsonSchema,
        changedAt: new Date(),
        changedBy: userId,
        comment: dto.comment,
      });
      schema.jsonSchema = dto.jsonSchema;
    }

    if (dto.validationLevel !== undefined) schema.validationLevel = dto.validationLevel;
    if (dto.validationAction !== undefined) schema.validationAction = dto.validationAction;
    if (dto.isActive !== undefined) schema.isActive = dto.isActive;
    if (dto.description !== undefined) schema.description = dto.description;
    schema.updatedBy = new Types.ObjectId(userId);

    await schema.save();
    return schema;
  }

  async delete(schemaId: string): Promise<void> {
    const result = await this.schemaModel.findByIdAndDelete(schemaId);
    if (!result) {
      throw new NotFoundException('Schema not found');
    }
  }

  async validateDocument(
    schemaId: string,
    dto: ValidateDocumentDto,
  ): Promise<{ valid: boolean; errors: any[] }> {
    const schema = await this.schemaModel.findById(schemaId);
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    const validate = this.ajv.compile(schema.jsonSchema);
    const valid = validate(dto.document);

    return {
      valid: !!valid,
      errors: validate.errors || [],
    };
  }

  async validateDocuments(
    schemaId: string,
    documents: Record<string, any>[],
  ): Promise<{ totalChecked: number; valid: number; invalid: number; errors: any[] }> {
    const schema = await this.schemaModel.findById(schemaId);
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    const validate = this.ajv.compile(schema.jsonSchema);
    let validCount = 0;
    let invalidCount = 0;
    const allErrors: any[] = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i] as any;
      const valid = validate(doc);
      if (valid) {
        validCount++;
      } else {
        invalidCount++;
        allErrors.push({
          documentIndex: i,
          document: doc._id || `doc_${i}`,
          errors: validate.errors,
        });
      }
    }

    return {
      totalChecked: documents.length,
      valid: validCount,
      invalid: invalidCount,
      errors: allErrors.slice(0, 100), // Limit errors returned
    };
  }

  generateSchemaFromDocuments(dto: GenerateSchemaDto): Record<string, any> {
    const { sampleDocuments, strict = false } = dto;
    
    if (!sampleDocuments || sampleDocuments.length === 0) {
      throw new BadRequestException('At least one sample document is required');
    }

    // Analyze all documents to infer types
    const fieldTypes = new Map<string, Set<string>>();
    const fieldExamples = new Map<string, any>();

    for (const doc of sampleDocuments) {
      this.analyzeObject(doc, '', fieldTypes, fieldExamples);
    }

    // Build JSON Schema
    const properties: Record<string, any> = {};
    const required: string[] = [];

    fieldTypes.forEach((types, field) => {
      const fieldPath = field.startsWith('.') ? field.slice(1) : field;
      if (fieldPath.includes('.')) return; // Skip nested for now, handle separately

      const typeArray = Array.from(types);
      let fieldSchema: any = {};

      if (typeArray.length === 1) {
        fieldSchema = this.getSchemaForType(typeArray[0], fieldExamples.get(field));
      } else if (typeArray.includes('null')) {
        const nonNullTypes = typeArray.filter(t => t !== 'null');
        if (nonNullTypes.length === 1) {
          fieldSchema = { ...this.getSchemaForType(nonNullTypes[0], fieldExamples.get(field)) };
          fieldSchema.type = [fieldSchema.type, 'null'];
        } else {
          fieldSchema = { anyOf: nonNullTypes.map(t => this.getSchemaForType(t, null)) };
        }
      } else {
        fieldSchema = { anyOf: typeArray.map(t => this.getSchemaForType(t, null)) };
      }

      properties[fieldPath] = fieldSchema;
      
      if (strict) {
        required.push(fieldPath);
      }
    });

    const schema: Record<string, any> = {
      $jsonSchema: {
        bsonType: 'object',
        properties,
      },
    };

    if (required.length > 0) {
      schema.$jsonSchema.required = required;
    }

    return schema.$jsonSchema;
  }

  private analyzeObject(
    obj: any,
    prefix: string,
    fieldTypes: Map<string, Set<string>>,
    fieldExamples: Map<string, any>,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_id') continue;
      
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const valueType = this.getValueType(value);

      if (!fieldTypes.has(fieldPath)) {
        fieldTypes.set(fieldPath, new Set());
      }
      fieldTypes.get(fieldPath)!.add(valueType);

      if (!fieldExamples.has(fieldPath)) {
        fieldExamples.set(fieldPath, value);
      }

      if (valueType === 'object' && value !== null) {
        this.analyzeObject(value, fieldPath, fieldTypes, fieldExamples);
      }
    }
  }

  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object' && value.$oid) return 'objectId';
    return typeof value;
  }

  private getSchemaForType(type: string, example: any): Record<string, any> {
    switch (type) {
      case 'string':
        const schema: any = { bsonType: 'string' };
        // Try to detect patterns
        if (typeof example === 'string') {
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(example)) {
            schema.pattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
            schema.description = 'Email address';
          } else if (/^\d{4}-\d{2}-\d{2}/.test(example)) {
            schema.description = 'ISO date string';
          }
        }
        return schema;
      case 'number':
        return { bsonType: 'number' };
      case 'boolean':
        return { bsonType: 'bool' };
      case 'object':
        return { bsonType: 'object' };
      case 'array':
        return { bsonType: 'array' };
      case 'date':
        return { bsonType: 'date' };
      case 'objectId':
        return { bsonType: 'objectId' };
      default:
        return {};
    }
  }

  async getSchemaHistory(schemaId: string): Promise<any[]> {
    const schema = await this.schemaModel.findById(schemaId);
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }
    return schema.history;
  }

  async revertToVersion(schemaId: string, version: number, userId: string): Promise<CollectionSchema> {
    const schema = await this.schemaModel.findById(schemaId);
    if (!schema) {
      throw new NotFoundException('Schema not found');
    }

    const historyEntry = schema.history.find(h => h.version === version);
    if (!historyEntry) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    schema.currentVersion += 1;
    schema.jsonSchema = historyEntry.schema;
    schema.history.push({
      version: schema.currentVersion,
      schema: historyEntry.schema,
      changedAt: new Date(),
      changedBy: userId,
      comment: `Reverted to version ${version}`,
    });
    schema.updatedBy = new Types.ObjectId(userId);

    await schema.save();
    return schema;
  }

  // Get common schema templates
  getTemplates(): Array<{ name: string; description: string; schema: Record<string, any> }> {
    return [
      {
        name: 'User Document',
        description: 'Schema for user/account documents',
        schema: {
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
        name: 'Product Catalog',
        description: 'Schema for e-commerce products',
        schema: {
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
        name: 'Event Log',
        description: 'Schema for event/audit logs',
        schema: {
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
        name: 'Time Series',
        description: 'Schema for time-series/metrics data',
        schema: {
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

