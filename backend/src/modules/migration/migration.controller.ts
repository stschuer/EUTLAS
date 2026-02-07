import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { MigrationService } from './migration.service';
import { ValidateSourceDto, StartMigrationDto } from './dto/migration.dto';

@ApiTags('Migration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/migrations')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze a source MongoDB for migration',
    description:
      'Connect to an external MongoDB instance and return a detailed analysis of all databases, collections, indexes, document counts, and estimated migration time.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'clusterId', description: 'Target cluster ID' })
  @ApiResponse({ status: 200, description: 'Source analysis results' })
  @ApiResponse({ status: 400, description: 'Invalid source URI or connection failed' })
  async analyzeSource(@Body() body: ValidateSourceDto) {
    return this.migrationService.analyzeSource(body.sourceUri);
  }

  @Post()
  @ApiOperation({
    summary: 'Start a migration from an external MongoDB',
    description:
      'Start a full migration from an external MongoDB instance (Atlas, self-hosted, etc.) to this EUTLAS cluster. ' +
      'The migration runs in the background. Use GET to poll for progress.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'clusterId', description: 'Target cluster ID' })
  @ApiResponse({ status: 201, description: 'Migration started' })
  @ApiResponse({ status: 400, description: 'Validation failed or migration already in progress' })
  async startMigration(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() body: StartMigrationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.migrationService.startMigration({
      sourceUri: body.sourceUri,
      sourceProvider: body.sourceProvider,
      targetClusterId: clusterId,
      projectId,
      orgId: (user as any).orgId || 'system',
      userId: user.userId,
      databases: body.databases,
      excludeDatabases: body.excludeDatabases,
      collections: body.collections,
      options: body.options,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List all migrations for this cluster',
    description: 'Returns all migration records for the specified cluster, sorted by creation date.',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'clusterId', description: 'Target cluster ID' })
  async listMigrations(@Param('clusterId') clusterId: string) {
    return this.migrationService.listMigrations(clusterId);
  }

  @Get(':migrationId')
  @ApiOperation({
    summary: 'Get migration status and progress',
    description:
      'Returns the full migration record including per-database progress, logs, and verification results.',
  })
  @ApiParam({ name: 'migrationId', description: 'Migration ID' })
  async getMigration(@Param('migrationId') migrationId: string) {
    const migration = await this.migrationService.getMigration(migrationId);
    if (!migration) {
      throw new NotFoundException('Migration not found');
    }
    return migration;
  }

  @Get(':migrationId/logs')
  @ApiOperation({
    summary: 'Get migration logs',
    description: 'Returns the last 500 log entries for this migration.',
  })
  @ApiParam({ name: 'migrationId', description: 'Migration ID' })
  async getMigrationLogs(@Param('migrationId') migrationId: string) {
    const migration = await this.migrationService.getMigration(migrationId);
    if (!migration) {
      throw new NotFoundException('Migration not found');
    }
    return {
      migrationId: migration.id,
      status: migration.status,
      progress: migration.progress,
      logs: migration.log,
    };
  }

  @Delete(':migrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an in-progress migration',
    description: 'Cancels a running migration. Already migrated data will remain in the target.',
  })
  @ApiParam({ name: 'migrationId', description: 'Migration ID' })
  async cancelMigration(@Param('migrationId') migrationId: string) {
    return this.migrationService.cancelMigration(migrationId);
  }

  @Post(':migrationId/retry')
  @ApiOperation({
    summary: 'Retry a failed or cancelled migration',
    description: 'Re-queues a failed or cancelled migration for another attempt.',
  })
  @ApiParam({ name: 'migrationId', description: 'Migration ID' })
  async retryMigration(@Param('migrationId') migrationId: string) {
    return this.migrationService.retryMigration(migrationId);
  }
}
