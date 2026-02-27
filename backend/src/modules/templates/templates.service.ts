import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template, TemplateDocument, TemplateType, TemplateVisibility } from './schemas/template.schema';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  QueryTemplatesDto,
  TemplateResponseDto,
} from './dto/template.dto';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
  ) {}

  async create(dto: CreateTemplateDto, userId: string): Promise<TemplateResponseDto> {
    // Validate tenant visibility
    if (dto.visibility === TemplateVisibility.TENANT && !dto.tenantId) {
      throw new BadRequestException('Tenant ID is required for tenant-specific templates');
    }

    const template = await this.templateModel.create({
      ...dto,
      tenantId: dto.tenantId ? new Types.ObjectId(dto.tenantId) : undefined,
      createdBy: new Types.ObjectId(userId),
      isActive: true,
      version: 1,
      usageCount: 0,
    });

    this.logger.log(`Created template ${template.id} (${template.type})`);
    return this.toResponseDto(template);
  }

  async findAll(query: QueryTemplatesDto, userId: string): Promise<{
    templates: TemplateResponseDto[];
    total: number;
    page: number;
    pages: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filter: any = {};

    // Type filter
    if (query.type) {
      filter.type = query.type;
    }

    // Category filter
    if (query.category) {
      filter.category = query.category;
    }

    // Active status filter
    if (query.activeOnly !== false) {
      filter.isActive = true;
    }

    // Featured filter
    if (query.featuredOnly) {
      filter.isFeatured = true;
    }

    // Tag filter
    if (query.tag) {
      filter.tags = query.tag;
    }

    // Visibility filter - show global templates + user's tenant templates
    if (query.visibility) {
      filter.visibility = query.visibility;
    } else if (query.tenantId) {
      filter.$or = [
        { visibility: TemplateVisibility.GLOBAL },
        { visibility: TemplateVisibility.TENANT, tenantId: new Types.ObjectId(query.tenantId) },
      ];
    } else {
      // Default: show all global templates
      filter.visibility = TemplateVisibility.GLOBAL;
    }

    // Search filter
    if (query.search) {
      filter.$text = { $search: query.search };
    }

    const [templates, total] = await Promise.all([
      this.templateModel
        .find(filter)
        .sort({ isFeatured: -1, usageCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.templateModel.countDocuments(filter),
    ]);

    return {
      templates: templates.map((t) => this.toResponseDto(t)),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(templateId: string, userId?: string): Promise<TemplateResponseDto> {
    const template = await this.templateModel.findById(templateId).lean();

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check visibility permissions
    if (template.visibility === TemplateVisibility.PRIVATE && userId) {
      if (template.createdBy.toString() !== userId) {
        throw new ForbiddenException('Access denied to this template');
      }
    }

    return this.toResponseDto(template);
  }

  async update(
    templateId: string,
    dto: UpdateTemplateDto,
    userId: string,
  ): Promise<TemplateResponseDto> {
    const template = await this.templateModel.findById(templateId);

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check if user can update (only creator or system admin)
    if (template.createdBy.toString() !== userId && !template.isSystem) {
      throw new ForbiddenException('Only the creator can update this template');
    }

    // System templates can't be modified
    if (template.isSystem) {
      throw new ForbiddenException('System templates cannot be modified');
    }

    // Update fields
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.category !== undefined) template.category = dto.category;
    if (dto.visibility !== undefined) template.visibility = dto.visibility;
    if (dto.content !== undefined) template.content = dto.content;
    if (dto.tags !== undefined) template.tags = dto.tags;
    if (dto.isFeatured !== undefined) template.isFeatured = dto.isFeatured;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;
    if (dto.metadata !== undefined) template.metadata = dto.metadata;

    template.updatedBy = new Types.ObjectId(userId);
    template.version += 1;

    await template.save();

    this.logger.log(`Updated template ${templateId}`);
    return this.toResponseDto(template);
  }

  async delete(templateId: string, userId: string): Promise<void> {
    const template = await this.templateModel.findById(templateId);

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // System templates can't be deleted
    if (template.isSystem) {
      throw new ForbiddenException('System templates cannot be deleted');
    }

    // Check permissions
    if (template.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the creator can delete this template');
    }

    await this.templateModel.findByIdAndDelete(templateId);
    this.logger.log(`Deleted template ${templateId}`);
  }

  async duplicate(
    templateId: string,
    userId: string,
    newName?: string,
  ): Promise<TemplateResponseDto> {
    const original = await this.templateModel.findById(templateId).lean();

    if (!original) {
      throw new NotFoundException('Template not found');
    }

    const template = await this.templateModel.create({
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      category: original.category,
      visibility: TemplateVisibility.PRIVATE, // Duplicates are always private initially
      content: original.content,
      tags: original.tags,
      metadata: original.metadata,
      createdBy: new Types.ObjectId(userId),
      isActive: true,
      version: 1,
      usageCount: 0,
      previousVersion: original._id,
    });

    this.logger.log(`Duplicated template ${templateId} to ${template.id}`);
    return this.toResponseDto(template);
  }

  async incrementUsage(templateId: string): Promise<void> {
    await this.templateModel.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });
  }

  async updateFileInfo(
    templateId: string,
    fileInfo: {
      fileUrl: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
    },
    userId: string,
  ): Promise<TemplateResponseDto> {
    const template = await this.templateModel.findById(templateId);

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    template.fileUrl = fileInfo.fileUrl;
    template.fileName = fileInfo.fileName;
    template.fileSize = fileInfo.fileSize;
    template.mimeType = fileInfo.mimeType;
    template.updatedBy = new Types.ObjectId(userId);

    await template.save();

    this.logger.log(`Updated file info for template ${templateId}`);
    return this.toResponseDto(template);
  }

  async getStats(): Promise<{
    totalTemplates: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    mostUsed: Array<{ id: string; name: string; usageCount: number }>;
  }> {
    const [totalTemplates, byTypeResult, byCategoryResult, mostUsed] = await Promise.all([
      this.templateModel.countDocuments({ isActive: true }),
      this.templateModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.templateModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      this.templateModel
        .find({ isActive: true })
        .sort({ usageCount: -1 })
        .limit(10)
        .select('name usageCount')
        .lean(),
    ]);

    const byType: Record<string, number> = {};
    byTypeResult.forEach((item) => {
      byType[item._id] = item.count;
    });

    const byCategory: Record<string, number> = {};
    byCategoryResult.forEach((item) => {
      byCategory[item._id] = item.count;
    });

    return {
      totalTemplates,
      byType,
      byCategory,
      mostUsed: mostUsed.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        usageCount: t.usageCount,
      })),
    };
  }

  private toResponseDto(template: any): TemplateResponseDto {
    return {
      id: template._id.toString(),
      name: template.name,
      description: template.description,
      type: template.type,
      category: template.category,
      visibility: template.visibility,
      tenantId: template.tenantId?.toString(),
      createdBy: template.createdBy.toString(),
      updatedBy: template.updatedBy?.toString(),
      content: template.content,
      fileUrl: template.fileUrl,
      fileName: template.fileName,
      fileSize: template.fileSize,
      mimeType: template.mimeType,
      isActive: template.isActive,
      isFeatured: template.isFeatured,
      isSystem: template.isSystem,
      tags: template.tags,
      usageCount: template.usageCount,
      previewUrl: template.previewUrl,
      metadata: template.metadata,
      version: template.version,
      previousVersion: template.previousVersion?.toString(),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }
}
