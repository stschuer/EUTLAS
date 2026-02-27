import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ImpersonateUserDto } from './dto/impersonate.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ImpersonationLog, ImpersonationLogDocument } from './schemas/impersonation-log.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ImpersonationLog.name) private impersonationLogModel: Model<ImpersonationLogDocument>,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password, name } = signupDto;

    // Check if user exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate verification token
    const verificationToken = uuidv4();

    // Create user
    const user = await this.usersService.create({
      email,
      passwordHash,
      name,
      verificationToken,
    });

    // Send verification email
    try {
      await this.emailService.sendEmailVerification(email, verificationToken, name);
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}: ${error}`);
    }

    // Send welcome email
    try {
      await this.emailService.sendWelcomeEmail(email, name || 'there');
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}: ${error}`);
    }

    return {
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      data: {
        userId: user.id,
        email: user.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Generate tokens
    const payload = {
      sub: user.id,
      email: user.email,
      verified: user.verified,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      data: {
        accessToken,
        expiresIn: this.getExpiresInSeconds(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          verified: user.verified,
        },
      },
    };
  }

  async verifyEmail(token: string) {
    const user = await this.usersService.findByVerificationToken(token);
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired verification token',
      });
    }

    await this.usersService.markAsVerified(user.id);

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    
    // Always return success to prevent email enumeration
    if (user) {
      const resetToken = uuidv4();
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await this.usersService.setPasswordResetToken(
        user.id,
        resetToken,
        resetExpires,
      );

      // Send reset email
      try {
        await this.emailService.sendPasswordReset(email, resetToken, user.name);
        this.logger.log(`Password reset email sent to ${email}`);
      } catch (error) {
        this.logger.error(`Failed to send password reset email to ${email}: ${error}`);
      }
    }

    return {
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByPasswordResetToken(token);
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePassword(user.id, passwordHash);

    return {
      success: true,
      message: 'Password reset successful',
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }

  /**
   * Impersonate a user (Global Admin only)
   * Creates a new JWT token for the target user with impersonation metadata
   */
  async impersonateUser(
    adminUserId: string,
    dto: ImpersonateUserDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    // 1. Verify admin user
    const adminUser = await this.userModel.findById(adminUserId).lean();
    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found');
    }

    if (!adminUser.isGlobalAdmin) {
      throw new ForbiddenException('Only global admins can impersonate users');
    }

    // 2. Verify target user exists
    const targetUser = await this.userModel.findById(dto.userId).lean();
    if (!targetUser) {
      throw new BadRequestException('Target user not found');
    }

    // 3. Prevent impersonating other global admins
    if (targetUser.isGlobalAdmin) {
      throw new ForbiddenException('Cannot impersonate other global administrators');
    }

    // 4. Prevent impersonating inactive users
    if (!targetUser.isActive) {
      throw new BadRequestException('Cannot impersonate inactive users');
    }

    // 5. Create audit log entry
    const logEntry = await this.impersonationLogModel.create({
      adminUserId: adminUser._id,
      adminEmail: adminUser.email,
      impersonatedUserId: targetUser._id,
      impersonatedEmail: targetUser.email,
      startedAt: new Date(),
      isActive: true,
      clientIp,
      userAgent,
    });

    this.logger.warn(
      `IMPERSONATION STARTED: Admin ${adminUser.email} (${adminUserId}) is impersonating ${targetUser.email} (${dto.userId})`,
    );

    // 6. Generate JWT with impersonation metadata
    const payload = {
      sub: targetUser._id.toString(),
      email: targetUser.email,
      verified: targetUser.verified,
      // Impersonation metadata
      impersonatedBy: adminUser._id.toString(),
      impersonatedByEmail: adminUser.email,
      impersonationLogId: logEntry._id.toString(),
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      data: {
        accessToken,
        expiresIn: this.getExpiresInSeconds(),
        user: {
          id: targetUser._id.toString(),
          email: targetUser.email,
          name: targetUser.name,
          verified: targetUser.verified,
        },
        impersonatedBy: {
          id: adminUser._id.toString(),
          email: adminUser.email,
          name: adminUser.name,
        },
      },
    };
  }

  /**
   * Stop impersonating and return to admin session
   */
  async stopImpersonating(impersonationLogId: string, adminUserId: string) {
    // Find and mark the log entry as ended
    const logEntry = await this.impersonationLogModel.findById(impersonationLogId);
    
    if (logEntry) {
      logEntry.endedAt = new Date();
      logEntry.isActive = false;
      await logEntry.save();

      this.logger.log(
        `IMPERSONATION ENDED: ${logEntry.adminEmail} stopped impersonating ${logEntry.impersonatedEmail}`,
      );
    }

    // Return fresh admin token
    const adminUser = await this.userModel.findById(adminUserId).lean();
    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found');
    }

    const payload = {
      sub: adminUser._id.toString(),
      email: adminUser.email,
      verified: adminUser.verified,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      data: {
        accessToken,
        expiresIn: this.getExpiresInSeconds(),
        user: {
          id: adminUser._id.toString(),
          email: adminUser.email,
          name: adminUser.name,
          verified: adminUser.verified,
        },
      },
    };
  }

  /**
   * Get impersonation logs (for admin audit)
   */
  async getImpersonationLogs(page = 1, limit = 50) {
    const [logs, total] = await Promise.all([
      this.impersonationLogModel
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.impersonationLogModel.countDocuments(),
    ]);

    return {
      logs,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  private getExpiresInSeconds(): number {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '7d');
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 604800; // 7 days default

    const value = parseInt(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * (multipliers[unit] || 86400);
  }
}

