import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { DatabaseUser, DatabaseUserDocument, DatabaseRoleAssignment } from './schemas/database-user.schema';
import { CreateDatabaseUserDto } from './dto/create-database-user.dto';
import { UpdateDatabaseUserDto } from './dto/update-database-user.dto';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { EventsService } from '../events/events.service';
import { ClustersService } from '../clusters/clusters.service';

@Injectable()
export class DatabaseUsersService {
  private readonly logger = new Logger(DatabaseUsersService.name);

  constructor(
    @InjectModel(DatabaseUser.name) private dbUserModel: Model<DatabaseUserDocument>,
    private readonly kubernetesService: KubernetesService,
    private readonly eventsService: EventsService,
    @Inject(forwardRef(() => ClustersService))
    private readonly clustersService: ClustersService,
  ) {}

  private async getClusterPlan(clusterId: string): Promise<string> {
    const cluster = await this.clustersService.findById(clusterId);
    return cluster?.plan || 'DEV';
  }

  async create(
    clusterId: string,
    projectId: string,
    orgId: string,
    createDto: CreateDatabaseUserDto,
  ): Promise<DatabaseUser> {
    // Check if username already exists for this cluster
    const existing = await this.dbUserModel.findOne({
      clusterId,
      username: createDto.username,
    }).exec();

    if (existing) {
      throw new ConflictException({
        code: 'USER_EXISTS',
        message: `Database user "${createDto.username}" already exists in this cluster`,
      });
    }

    // Validate roles
    this.validateRoles(createDto.roles);

    // Hash password for storage
    const passwordHash = await bcrypt.hash(createDto.password, 12);

    // Create user record
    const dbUser = new this.dbUserModel({
      clusterId,
      projectId,
      orgId,
      username: createDto.username,
      passwordHash,
      roles: createDto.roles,
      scopes: createDto.scopes || [],
      authenticationDatabase: 'admin',
    });

    await dbUser.save();

    // Create user in MongoDB cluster (via K8s)
    try {
      const plan = await this.getClusterPlan(clusterId);
      await this.kubernetesService.createDatabaseUser({
        clusterId,
        projectId,
        plan,
        username: createDto.username,
        password: createDto.password,
        roles: createDto.roles as DatabaseRoleAssignment[],
      });
    } catch (error: any) {
      // Rollback: delete the record if K8s creation fails
      await this.dbUserModel.findByIdAndDelete(dbUser.id).exec();
      this.logger.error(`Failed to create user in cluster: ${error.message}`, error.stack);
      throw new BadRequestException(
        `Failed to provision database user in cluster: ${error.message || 'Unknown error'}`,
      );
    }

    // Log event (non-critical, don't fail the request if event logging fails)
    try {
      await this.eventsService.createEvent({
        orgId,
        projectId,
        clusterId,
        type: 'CLUSTER_UPDATED',
        severity: 'info',
        message: `Database user "${createDto.username}" created`,
        metadata: { username: createDto.username, roles: createDto.roles },
      });
    } catch (eventError: any) {
      this.logger.warn(`Failed to log event for user creation: ${eventError.message}`);
    }

    this.logger.log(`Created database user ${createDto.username} for cluster ${clusterId}`);
    return dbUser;
  }

  async findAllByCluster(clusterId: string): Promise<DatabaseUser[]> {
    return this.dbUserModel.find({ clusterId }).sort({ createdAt: -1 }).exec();
  }

  async findById(userId: string): Promise<DatabaseUserDocument | null> {
    return this.dbUserModel.findById(userId).exec();
  }

  async findByClusterAndUsername(clusterId: string, username: string): Promise<DatabaseUserDocument | null> {
    return this.dbUserModel.findOne({ clusterId, username }).exec();
  }

  async update(
    userId: string,
    updateDto: UpdateDatabaseUserDto,
  ): Promise<DatabaseUser> {
    const dbUser = await this.findById(userId);
    if (!dbUser) {
      throw new NotFoundException('Database user not found');
    }

    const updateData: any = {};

    if (updateDto.password) {
      updateData.passwordHash = await bcrypt.hash(updateDto.password, 12);
    }

    if (updateDto.roles) {
      this.validateRoles(updateDto.roles);
      updateData.roles = updateDto.roles;
    }

    if (updateDto.scopes !== undefined) {
      updateData.scopes = updateDto.scopes;
    }

    if (updateDto.isActive !== undefined) {
      updateData.isActive = updateDto.isActive;
    }

    // Update in K8s/MongoDB
    try {
      const plan = await this.getClusterPlan(dbUser.clusterId.toString());
      await this.kubernetesService.updateDatabaseUser({
        clusterId: dbUser.clusterId.toString(),
        projectId: dbUser.projectId.toString(),
        plan,
        username: dbUser.username,
        password: updateDto.password,
        roles: updateDto.roles as DatabaseRoleAssignment[],
        isActive: updateDto.isActive,
      });
    } catch (error: any) {
      this.logger.error(`Failed to update user in cluster: ${error.message}`);
      throw new BadRequestException('Failed to update user in database cluster');
    }

    // Update record
    const updated = await this.dbUserModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true },
    ).exec();

    if (!updated) {
      throw new NotFoundException('Database user not found');
    }

    // Log event (non-critical)
    try {
      await this.eventsService.createEvent({
        orgId: dbUser.orgId.toString(),
        projectId: dbUser.projectId.toString(),
        clusterId: dbUser.clusterId.toString(),
        type: 'CLUSTER_UPDATED',
        severity: 'info',
        message: `Database user "${dbUser.username}" updated`,
      });
    } catch (eventError: any) {
      this.logger.warn(`Failed to log event for user update: ${eventError.message}`);
    }

    return updated;
  }

  async delete(userId: string): Promise<void> {
    const dbUser = await this.findById(userId);
    if (!dbUser) {
      throw new NotFoundException('Database user not found');
    }

    // Don't allow deleting the admin user created during cluster setup
    if (dbUser.username === 'admin') {
      throw new BadRequestException({
        code: 'CANNOT_DELETE_ADMIN',
        message: 'Cannot delete the default admin user',
      });
    }

    // Delete from K8s/MongoDB
    try {
      const plan = await this.getClusterPlan(dbUser.clusterId.toString());
      await this.kubernetesService.deleteDatabaseUser({
        clusterId: dbUser.clusterId.toString(),
        projectId: dbUser.projectId.toString(),
        plan,
        username: dbUser.username,
      });
    } catch (error: any) {
      this.logger.error(`Failed to delete user from cluster: ${error.message}`);
      // Continue with record deletion even if K8s fails
    }

    // Delete record
    await this.dbUserModel.findByIdAndDelete(userId).exec();

    // Log event (non-critical)
    try {
      await this.eventsService.createEvent({
        orgId: dbUser.orgId.toString(),
        projectId: dbUser.projectId.toString(),
        clusterId: dbUser.clusterId.toString(),
        type: 'CLUSTER_UPDATED',
        severity: 'info',
        message: `Database user "${dbUser.username}" deleted`,
      });
    } catch (eventError: any) {
      this.logger.warn(`Failed to log event for user deletion: ${eventError.message}`);
    }

    this.logger.log(`Deleted database user ${dbUser.username} from cluster ${dbUser.clusterId}`);
  }

  private validateRoles(roles: { role: string; db: string }[]): void {
    const validRoles = [
      'read', 'readWrite', 'dbAdmin', 'dbOwner', 'userAdmin',
      'clusterAdmin', 'readAnyDatabase', 'readWriteAnyDatabase',
      'userAdminAnyDatabase', 'dbAdminAnyDatabase', 'root',
    ];

    for (const roleAssignment of roles) {
      if (!validRoles.includes(roleAssignment.role)) {
        throw new BadRequestException({
          code: 'INVALID_ROLE',
          message: `Invalid role: ${roleAssignment.role}`,
        });
      }

      // Cluster-wide roles must use 'admin' database
      const clusterWideRoles = [
        'clusterAdmin', 'readAnyDatabase', 'readWriteAnyDatabase',
        'userAdminAnyDatabase', 'dbAdminAnyDatabase', 'root',
      ];
      
      if (clusterWideRoles.includes(roleAssignment.role) && roleAssignment.db !== 'admin') {
        throw new BadRequestException({
          code: 'INVALID_ROLE_DB',
          message: `Role "${roleAssignment.role}" must be assigned to the "admin" database`,
        });
      }
    }
  }
}

