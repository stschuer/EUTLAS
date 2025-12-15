import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserData } from '../../common/decorators/current-user.decorator';
import { BackupPolicyService } from './backup-policy.service';
import { UpdateBackupPolicyDto, CompliancePresetDto } from './dto/backup-policy.dto';

@ApiTags('Backup Policy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/clusters/:clusterId/backup-policy')
export class BackupPolicyController {
  constructor(private readonly policyService: BackupPolicyService) {}

  @Get()
  @ApiOperation({ summary: 'Get backup policy for cluster' })
  async getPolicy(@Param('clusterId') clusterId: string) {
    const policy = await this.policyService.getOrCreate(clusterId);
    return { success: true, data: policy };
  }

  @Patch()
  @ApiOperation({ summary: 'Update backup policy' })
  async updatePolicy(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: UpdateBackupPolicyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const policy = await this.policyService.update(clusterId, dto, user.userId, undefined, projectId);
    return { success: true, data: policy };
  }

  @Get('presets')
  @ApiOperation({ summary: 'Get available compliance presets' })
  getPresets() {
    const presets = this.policyService.getCompliancePresets();
    return { success: true, data: presets };
  }

  @Post('presets/apply')
  @ApiOperation({ summary: 'Apply a compliance preset' })
  async applyPreset(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() dto: CompliancePresetDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const policy = await this.policyService.applyCompliancePreset(
      clusterId,
      dto.preset,
      user.userId,
      undefined,
      projectId,
    );
    return { success: true, data: policy };
  }

  @Get('compliance-status')
  @ApiOperation({ summary: 'Get compliance status' })
  async getComplianceStatus(@Param('clusterId') clusterId: string) {
    const status = await this.policyService.getComplianceStatus(clusterId);
    return { success: true, data: status };
  }

  @Post('legal-hold/enable')
  @ApiOperation({ summary: 'Enable legal hold' })
  async enableLegalHold(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @Body() body: { reason: string; untilDate?: Date },
    @CurrentUser() user: CurrentUserData,
  ) {
    const policy = await this.policyService.enableLegalHold(
      clusterId,
      body.reason,
      body.untilDate || null,
      user.userId,
      undefined,
      projectId,
    );
    return { success: true, data: policy };
  }

  @Post('legal-hold/disable')
  @ApiOperation({ summary: 'Disable legal hold' })
  async disableLegalHold(
    @Param('projectId') projectId: string,
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const policy = await this.policyService.disableLegalHold(
      clusterId,
      user.userId,
      undefined,
      projectId,
    );
    return { success: true, data: policy };
  }
}





