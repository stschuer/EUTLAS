import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { GlobalAdminGuard } from '../admin/guards/global-admin.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { TemplatesService } from './templates.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  QueryTemplatesDto,
  TemplateResponseDto,
} from './dto/template.dto';

@ApiTags('Templates')
@ApiBearerAuth()
@Controller('admin/templates')
@UseGuards(JwtAuthGuard, GlobalAdminGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get template statistics' })
  @ApiResponse({ status: 200 })
  async getStats() {
    const stats = await this.templatesService.getStats();
    return { success: true, data: stats };
  }

  @Get()
  @ApiOperation({ summary: 'List all templates with filters' })
  @ApiResponse({ status: 200, type: [TemplateResponseDto] })
  async findAll(
    @Query() query: QueryTemplatesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.templatesService.findAll(query, user.userId);
    return { success: true, data: result };
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async findOne(
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const template = await this.templatesService.findById(templateId, user.userId);
    return { success: true, data: template };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const template = await this.templatesService.create(dto, user.userId);
    return { success: true, data: template };
  }

  @Post(':templateId/duplicate')
  @ApiOperation({ summary: 'Duplicate a template' })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async duplicate(
    @Param('templateId') templateId: string,
    @Body() body: { name?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    const template = await this.templatesService.duplicate(
      templateId,
      user.userId,
      body.name,
    );
    return { success: true, data: template };
  }

  @Post(':templateId/upload')
  @ApiOperation({ summary: 'Upload file for document template (PPT, DOCX)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('templateId') templateId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.ms-powerpoint', // .ppt
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/pdf', // .pdf
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only PPT, PPTX, DOC, DOCX, and PDF files are allowed.',
      );
    }

    // In a real implementation, upload to S3/MinIO/cloud storage
    // For now, we'll simulate this
    const fileUrl = `/uploads/templates/${templateId}/${file.originalname}`;

    const template = await this.templatesService.updateFileInfo(
      templateId,
      {
        fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
      user.userId,
    );

    return { success: true, data: template };
  }

  @Put(':templateId')
  @ApiOperation({ summary: 'Update a template' })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async update(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const template = await this.templatesService.update(templateId, dto, user.userId);
    return { success: true, data: template };
  }

  @Delete(':templateId')
  @ApiOperation({ summary: 'Delete a template' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.templatesService.delete(templateId, user.userId);
  }

  @Post(':templateId/increment-usage')
  @ApiOperation({ summary: 'Increment template usage count' })
  @ApiResponse({ status: 200 })
  @HttpCode(HttpStatus.OK)
  async incrementUsage(@Param('templateId') templateId: string) {
    await this.templatesService.incrementUsage(templateId);
    return { success: true, message: 'Usage count incremented' };
  }
}

// Tenant-specific template access (for regular users)
@ApiTags('Templates')
@ApiBearerAuth()
@Controller('tenant/templates')
@UseGuards(JwtAuthGuard)
export class TenantTemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List templates available to tenant' })
  @ApiResponse({ status: 200, type: [TemplateResponseDto] })
  async findAll(
    @Query() query: QueryTemplatesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // For tenant users, only show global and their tenant's templates
    const result = await this.templatesService.findAll(query, user.userId);
    return { success: true, data: result };
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async findOne(
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const template = await this.templatesService.findById(templateId, user.userId);
    return { success: true, data: template };
  }

  @Post(':templateId/increment-usage')
  @ApiOperation({ summary: 'Increment template usage count when using it' })
  @ApiResponse({ status: 200 })
  @HttpCode(HttpStatus.OK)
  async incrementUsage(@Param('templateId') templateId: string) {
    await this.templatesService.incrementUsage(templateId);
    return { success: true, message: 'Usage count incremented' };
  }
}
