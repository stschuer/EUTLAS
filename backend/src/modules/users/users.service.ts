import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import * as bcrypt from 'bcryptjs';

interface CreateUserData {
  email: string;
  passwordHash: string;
  name?: string;
  verificationToken?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(data: CreateUserData): Promise<User> {
    const user = new this.userModel({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name,
      verificationToken: data.verificationToken,
      verified: false,
    });
    return user.save();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByVerificationToken(token: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ verificationToken: token }).exec();
  }

  async findByPasswordResetToken(token: string): Promise<UserDocument | null> {
    return this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    }).exec();
  }

  async markAsVerified(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      verified: true,
      verificationToken: null,
    }).exec();
  }

  async setPasswordResetToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      passwordResetToken: token,
      passwordResetExpires: expires,
    }).exec();
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
    }).exec();
  }

  async updateProfile(
    userId: string,
    data: { name?: string },
  ): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: data },
      { new: true },
    ).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Admin update user profile (for org admins updating member details)
   */
  async adminUpdateUser(
    userId: string,
    data: { name?: string; email?: string },
  ): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: { name?: string; email?: string } = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.email !== undefined && data.email.toLowerCase() !== user.email) {
      // Check if email is already taken
      const existingUser = await this.findByEmail(data.email);
      if (existingUser) {
        throw new ConflictException({
          code: 'EMAIL_IN_USE',
          message: 'This email address is already in use by another account',
        });
      }
      updateData.email = data.email.toLowerCase();
    }

    if (Object.keys(updateData).length === 0) {
      return user;
    }

    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true },
    ).exec();

    this.logger.log(`Admin updated user ${userId}: ${JSON.stringify(updateData)}`);

    return updatedUser!;
  }

  /**
   * Change user password (requires current password verification)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    // Hash and save new password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
    }).exec();

    this.logger.log(`Password changed for user ${userId}`);
  }

  /**
   * Delete user account and all associated data
   */
  async deleteAccount(userId: string, password: string): Promise<{ deletedCounts: Record<string, number> }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD',
        message: 'Password is incorrect',
      });
    }

    this.logger.log(`Starting account deletion for user ${userId}`);
    const deletedCounts: Record<string, number> = {};

    // Get all orgs where user is OWNER
    const ownedOrgs = await this.connection.collection('orgmembers').find({
      userId: user._id,
      role: 'OWNER',
    }).toArray();

    if (ownedOrgs.length > 0) {
      throw new BadRequestException({
        code: 'OWNS_ORGANIZATIONS',
        message: `You are the owner of ${ownedOrgs.length} organization(s). Transfer ownership or delete these organizations first.`,
      });
    }

    // Remove user from all organizations (non-owner memberships)
    const membershipResult = await this.connection.collection('orgmembers').deleteMany({
      userId: user._id,
    });
    if (membershipResult.deletedCount > 0) {
      deletedCounts['orgmembers'] = membershipResult.deletedCount;
    }

    // Delete user's invitations
    const invitationResult = await this.connection.collection('invitations').deleteMany({
      $or: [
        { invitedBy: user._id },
        { acceptedBy: user._id },
      ],
    });
    if (invitationResult.deletedCount > 0) {
      deletedCounts['invitations'] = invitationResult.deletedCount;
    }

    // Delete the user
    await this.userModel.findByIdAndDelete(userId).exec();
    deletedCounts['users'] = 1;

    this.logger.log(`Account deletion complete for user ${userId}. Summary: ${JSON.stringify(deletedCounts)}`);
    
    return { deletedCounts };
  }
}





