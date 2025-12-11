import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseUsersController } from './database-users.controller';
import { DatabaseUsersService } from './database-users.service';
import { DatabaseUser, DatabaseUserSchema } from './schemas/database-user.schema';
import { ClustersModule } from '../clusters/clusters.module';
import { ProjectsModule } from '../projects/projects.module';
import { OrgsModule } from '../orgs/orgs.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DatabaseUser.name, schema: DatabaseUserSchema },
    ]),
    forwardRef(() => ClustersModule),
    ProjectsModule,
    OrgsModule,
    KubernetesModule,
    EventsModule,
  ],
  controllers: [DatabaseUsersController],
  providers: [DatabaseUsersService],
  exports: [DatabaseUsersService],
})
export class DatabaseUsersModule {}



