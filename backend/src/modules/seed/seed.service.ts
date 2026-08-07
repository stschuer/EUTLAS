import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Organization,
  OrganizationDocument,
} from '../orgs/schemas/org.schema';
import { OrgMember, OrgMemberDocument } from '../orgs/schemas/org-member.schema';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(OrgMember.name) private orgMemberModel: Model<OrgMemberDocument>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'test') {
      this.logger.log('Skipping seed in test environment');
      return;
    }
    await this.seedGlobalAdmin();
  }

  private async seedGlobalAdmin() {
    const adminEmail = this.configService.get<string>(
      'SEED_ADMIN_EMAIL',
      'simon.tschuertz@web.de',
    );
    // Never ship a hardcoded default password: a value committed to the repo is
    // effectively public and this account is a global admin. When
    // SEED_ADMIN_PASSWORD is unset, generate a strong random one (logged once
    // below, on first creation) so a fresh deployment gets a unique credential.
    const configuredPassword =
      this.configService.get<string>('SEED_ADMIN_PASSWORD');
    const adminPassword =
      configuredPassword || randomBytes(24).toString('base64url');
    const adminName = this.configService.get<string>(
      'SEED_ADMIN_NAME',
      'Simon Tschürtz',
    );
    const orgName = this.configService.get<string>(
      'SEED_ORG_NAME',
      'RoPhi UG',
    );

    // Check if admin already exists
    const existingAdmin = await this.userModel
      .findOne({ email: adminEmail.toLowerCase() })
      .lean();

    if (existingAdmin) {
      // Ensure the existing user is a global admin
      if (!existingAdmin.isGlobalAdmin) {
        await this.userModel.updateOne(
          { _id: existingAdmin._id },
          { $set: { isGlobalAdmin: true, verified: true, isActive: true } },
        );
        this.logger.log(
          `Promoted existing user ${adminEmail} to global admin`,
        );
      } else {
        this.logger.log(
          `Global admin ${adminEmail} already exists — skipping seed`,
        );
      }

      // Ensure org exists for this admin
      await this.ensureOrganization(existingAdmin._id.toString(), orgName);
      return;
    }

    // Create the admin user
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const admin = await this.userModel.create({
      email: adminEmail.toLowerCase(),
      passwordHash,
      name: adminName,
      verified: true,
      isGlobalAdmin: true,
      isActive: true,
    });

    this.logger.log(
      `Created global admin: ${adminEmail} (ID: ${admin._id})`,
    );

    if (!configuredPassword) {
      this.logger.warn(
        `SEED_ADMIN_PASSWORD was not set — generated a one-time admin password ` +
          `for ${adminEmail}: ${adminPassword}\n` +
          `Store it now and set SEED_ADMIN_PASSWORD; it will not be shown again.`,
      );
    }

    // Create the default organization
    await this.ensureOrganization(admin._id.toString(), orgName);

    this.logger.log('Seed completed successfully');
  }

  private async ensureOrganization(userId: string, orgName: string) {
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existingOrg = await this.orgModel.findOne({ slug }).lean();

    if (existingOrg) {
      this.logger.log(`Organization "${orgName}" already exists — skipping`);

      // Ensure the admin is a member
      const membership = await this.orgMemberModel
        .findOne({ orgId: existingOrg._id, userId })
        .lean();

      if (!membership) {
        await this.orgMemberModel.create({
          orgId: existingOrg._id,
          userId,
          role: 'OWNER',
        });
        this.logger.log(`Added admin as OWNER of "${orgName}"`);
      }
      return;
    }

    // Create the organization
    const org = await this.orgModel.create({
      name: orgName,
      slug,
      ownerId: userId,
    });

    // Create the OWNER membership
    await this.orgMemberModel.create({
      orgId: org._id,
      userId,
      role: 'OWNER',
    });

    this.logger.log(
      `Created organization "${orgName}" (ID: ${org._id}) with admin as OWNER`,
    );
  }
}
