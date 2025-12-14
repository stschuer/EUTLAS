import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class GlobalAdminGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Fetch the full user document to check isGlobalAdmin
    const fullUser = await this.userModel.findById(user.sub).lean();

    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    if (!fullUser.isGlobalAdmin) {
      throw new ForbiddenException('Global admin access required');
    }

    if (!fullUser.isActive) {
      throw new ForbiddenException('User account is deactivated');
    }

    // Attach full user to request for use in controllers
    request.adminUser = fullUser;

    return true;
  }
}


