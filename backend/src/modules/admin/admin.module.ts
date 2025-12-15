import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GlobalAdminGuard } from './guards/global-admin.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Organization, OrganizationSchema } from '../orgs/schemas/org.schema';
import { OrgMember, OrgMemberSchema } from '../orgs/schemas/org-member.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Cluster, ClusterSchema } from '../clusters/schemas/cluster.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrgMember.name, schema: OrgMemberSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Cluster.name, schema: ClusterSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, GlobalAdminGuard],
  exports: [AdminService, GlobalAdminGuard],
})
export class AdminModule {}



