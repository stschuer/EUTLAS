import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/auth.guard';

@ApiTags('Network Access')
@Controller('network')
export class IpDetectionController {
  @Get('my-ip')
  @ApiOperation({ summary: 'Get your current public IP address (no auth required)' })
  async getMyIpPublic(@Req() req: Request) {
    const clientIp = this.getClientIp(req);

    return {
      success: true,
      data: {
        ip: clientIp,
        timestamp: new Date().toISOString(),
        message: 'This is your current public IP address as seen by the server.',
      },
    };
  }

  @Get('my-ip/authenticated')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get your current IP address (authenticated)' })
  async getMyIpAuthenticated(@Req() req: Request) {
    const clientIp = this.getClientIp(req);

    return {
      success: true,
      data: {
        ip: clientIp,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private getClientIp(req: Request): string {
    // Check various headers for the real IP (behind proxies/load balancers)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',');
      return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (cfConnectingIp) {
      return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    }

    return req.ip || req.socket.remoteAddress || '0.0.0.0';
  }
}

