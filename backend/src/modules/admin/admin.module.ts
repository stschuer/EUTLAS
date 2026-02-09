import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GlobalAdminGuard } from './guards/global-admin.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Organization, OrganizationSchema } from '../orgs/schemas/org.schema';
import { OrgMember, OrgMemberSchema } from '../orgs/schemas/org-member.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Cluster, ClusterSchema } from '../clusters/schemas/cluster.schema';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { ClustersModule } from '../clusters/clusters.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrgMember.name, schema: OrgMemberSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Cluster.name, schema: ClusterSchema },
    ]),
    KubernetesModule,
    forwardRef(() => ClustersModule),
  ],
  controllers: [AdminController],
  providers: [AdminService, GlobalAdminGuard],
  exports: [AdminService, GlobalAdminGuard],
})
export class AdminModule {}



