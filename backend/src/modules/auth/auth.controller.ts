import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { GlobalAdminGuard } from '../admin/guards/global-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ImpersonateUserDto, ImpersonationResponseDto } from './dto/impersonate.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 signups per hour per IP
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully created' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Too many signup attempts' })
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 login attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('verify-email')
  @SkipThrottle() // No throttling needed for email verification
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 600000 } }) // 3 requests per 10 minutes
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  @ApiResponse({ status: 429, description: 'Too many password reset requests' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 429, description: 'Too many reset attempts' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
  }

  // ============ Impersonation (Global Admin Only) ============

  @Post('impersonate')
  @UseGuards(JwtAuthGuard, GlobalAdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 impersonations per minute
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Impersonate a user (Global Admin only)',
    description: 'Allows a global admin to log in as another user for support purposes. All impersonation events are logged.',
  })
  @ApiResponse({ status: 200, description: 'Successfully impersonating user', type: ImpersonationResponseDto })
  @ApiResponse({ status: 403, description: 'Not authorized - global admin access required' })
  @ApiResponse({ status: 400, description: 'Target user not found or cannot be impersonated' })
  @ApiResponse({ status: 429, description: 'Too many impersonation attempts' })
  async impersonateUser(
    @CurrentUser('userId') adminUserId: string,
    @Body() dto: ImpersonateUserDto,
    @Req() req: any,
  ) {
    const clientIp = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.impersonateUser(adminUserId, dto, clientIp, userAgent);
  }

  @Post('stop-impersonating')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stop impersonating and return to admin session',
    description: 'Ends the impersonation session and returns a fresh token for the admin user.',
  })
  @ApiResponse({ status: 200, description: 'Successfully stopped impersonating' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async stopImpersonating(@Req() req: any) {
    const impersonationLogId = req.user?.impersonationLogId;
    const adminUserId = req.user?.impersonatedBy;

    if (!impersonationLogId || !adminUserId) {
      // Not currently impersonating - just return current token info
      return {
        success: true,
        message: 'Not currently impersonating',
      };
    }

    return this.authService.stopImpersonating(impersonationLogId, adminUserId);
  }

  @Get('impersonation-logs')
  @UseGuards(JwtAuthGuard, GlobalAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get impersonation audit logs (Global Admin only)',
    description: 'Retrieves a paginated list of all impersonation events for audit purposes.',
  })
  @ApiResponse({ status: 200, description: 'Impersonation logs retrieved' })
  @ApiResponse({ status: 403, description: 'Not authorized - global admin access required' })
  async getImpersonationLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.authService.getImpersonationLogs(page || 1, limit || 50);
  }
}

