import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
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
    // TODO: Check MongoDB connection, K8s connection etc.
    return {
      status: 'ready',
      checks: {
        database: 'ok',
        kubernetes: 'ok',
      },
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

