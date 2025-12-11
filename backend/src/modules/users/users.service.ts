import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

interface CreateUserData {
  email: string;
  passwordHash: string;
  name?: string;
  verificationToken?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
}



