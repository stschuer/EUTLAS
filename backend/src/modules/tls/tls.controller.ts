import { Body, Controller, ForbiddenException, Get, Header, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ClusterTlsService } from './cluster-tls.service';
import { PlatformCaService } from './platform-ca.service';

class EnableTlsDto {
  @IsIn(['optional', 'required'])
  mode: 'optional' | 'required';
}

@ApiTags('TLS')
@Controller()
export class TlsController {
  constructor(
    private readonly clusterTls: ClusterTlsService,
    private readonly ca: PlatformCaService,
  ) {}

  @Public()
  @Get('tls/ca.pem')
  @Header('Content-Type', 'application/x-pem-file')
  @Header('Content-Disposition', 'attachment; filename="eutlas-ca.pem"')
  @ApiOperation({ summary: 'Platform CA certificate that signs all cluster TLS certificates (use as tlsCAFile)' })
  async caPem(): Promise<string> {
    return this.ca.getCaPem();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('projects/:projectId/clusters/:clusterId/tls')
  @ApiOperation({ summary: 'Enable TLS (optional → still accepts plaintext; required → TLS only) and public DNS endpoint' })
  async enable(@Param('clusterId') clusterId: string, @Body() body: EnableTlsDto, @Req() req: any) {
    // TenantAccessInterceptor verified membership and resolved the caller's role.
    if (!['OWNER', 'ADMIN'].includes(req.orgRole)) {
      throw new ForbiddenException('Only organization owners and admins can change TLS settings');
    }
    return { success: true, data: await this.clusterTls.enable(clusterId, body.mode) };
  }
}
