import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'eutlas-backend',
      version: '0.1.0',
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  ready() {
    const result = this.healthService.getReadinessChecks();

    if (result.status !== 'ready') {
      throw new ServiceUnavailableException(result);
    }

    return {
      status: 'ready',
      checks: result.checks,
    };
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness check' })
  live() {
    return {
      status: 'live',
    };
  }
}
