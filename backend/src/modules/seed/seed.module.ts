import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Organization,
  OrganizationSchema,
} from '../orgs/schemas/org.schema';
import {
  OrgMember,
  OrgMemberSchema,
} from '../orgs/schemas/org-member.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrgMember.name, schema: OrgMemberSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
