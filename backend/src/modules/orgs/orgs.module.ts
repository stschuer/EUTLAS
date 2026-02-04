import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { Organization, OrganizationSchema } from './schemas/org.schema';
import { OrgMember, OrgMemberSchema } from './schemas/org-member.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrgMember.name, schema: OrgMemberSchema },
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [OrgsController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}





