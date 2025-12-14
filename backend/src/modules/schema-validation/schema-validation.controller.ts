import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { SchemaValidationService } from './schema-validation.service';
import { CreateSchemaDto, UpdateSchemaDto, ValidateDocumentDto, GenerateSchemaDto } from './dto/schema-validation.dto';

@ApiTags('Schema Validation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/schemas')
export class SchemaValidationController {
  constructor(private readonly schemaService: SchemaValidationService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Get schema templates' })
  getTemplates() {
    const templates = this.schemaService.getTemplates();
    return { success: true, data: templates };
  }

  @Post()
  @ApiOperation({ summary: 'Create collection schema' })
  async create(
    @Param('clusterId') clusterId: string,
    @Body() dto: CreateSchemaDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const schema = await this.schemaService.create(clusterId, dto, user.userId);
    return { success: true, data: schema };
  }

  @Get()
  @ApiOperation({ summary: 'List all schemas for cluster' })
  async findAll(@Param('clusterId') clusterId: string) {
    const schemas = await this.schemaService.findAllByCluster(clusterId);
    return { success: true, data: schemas };
  }

  @Get(':schemaId')
  @ApiOperation({ summary: 'Get schema details' })
  async findOne(@Param('schemaId') schemaId: string) {
    const schema = await this.schemaService.findById(schemaId);
    if (!schema) throw new NotFoundException('Schema not found');
    return { success: true, data: schema };
  }

  @Get('collection/:database/:collection')
  @ApiOperation({ summary: 'Get schema by collection name' })
  async findByCollection(
    @Param('clusterId') clusterId: string,
    @Param('database') database: string,
    @Param('collection') collection: string,
  ) {
    const schema = await this.schemaService.findByCollection(clusterId, database, collection);
    return { success: true, data: schema };
  }

  @Patch(':schemaId')
  @ApiOperation({ summary: 'Update schema' })
  async update(
    @Param('schemaId') schemaId: string,
    @Body() dto: UpdateSchemaDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const schema = await this.schemaService.update(schemaId, dto, user.userId);
    return { success: true, data: schema };
  }

  @Delete(':schemaId')
  @ApiOperation({ summary: 'Delete schema' })
  async delete(@Param('schemaId') schemaId: string) {
    await this.schemaService.delete(schemaId);
    return { success: true, message: 'Schema deleted' };
  }

  @Post(':schemaId/validate')
  @ApiOperation({ summary: 'Validate a document against schema' })
  async validateDocument(
    @Param('schemaId') schemaId: string,
    @Body() dto: ValidateDocumentDto,
  ) {
    const result = await this.schemaService.validateDocument(schemaId, dto);
    return { success: true, data: result };
  }

  @Post(':schemaId/validate-bulk')
  @ApiOperation({ summary: 'Validate multiple documents against schema' })
  async validateDocuments(
    @Param('schemaId') schemaId: string,
    @Body() body: { documents: Record<string, any>[] },
  ) {
    const result = await this.schemaService.validateDocuments(schemaId, body.documents);
    return { success: true, data: result };
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate schema from sample documents' })
  generateSchema(@Body() dto: GenerateSchemaDto) {
    const schema = this.schemaService.generateSchemaFromDocuments(dto);
    return { success: true, data: schema };
  }

  @Get(':schemaId/history')
  @ApiOperation({ summary: 'Get schema version history' })
  async getHistory(@Param('schemaId') schemaId: string) {
    const history = await this.schemaService.getSchemaHistory(schemaId);
    return { success: true, data: history };
  }

  @Post(':schemaId/revert/:version')
  @ApiOperation({ summary: 'Revert to a previous schema version' })
  async revert(
    @Param('schemaId') schemaId: string,
    @Param('version') version: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const schema = await this.schemaService.revertToVersion(schemaId, parseInt(version), user.userId);
    return { success: true, data: schema };
  }
}




