import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async create(orgId: string, createProjectDto: CreateProjectDto): Promise<Project> {
    const slug = this.generateSlug(createProjectDto.name);
    
    // Check if slug exists within org
    const existing = await this.projectModel.findOne({ orgId, slug }).exec();
    if (existing) {
      throw new ConflictException({
        code: 'PROJECT_EXISTS',
        message: 'A project with a similar name already exists in this organization',
      });
    }

    const project = new this.projectModel({
      orgId,
      name: createProjectDto.name,
      slug,
      description: createProjectDto.description,
    });

    return project.save();
  }

  async findAllByOrg(orgId: string): Promise<Project[]> {
    return this.projectModel.find({ orgId }).sort({ createdAt: -1 }).exec();
  }

  async findById(projectId: string): Promise<ProjectDocument | null> {
    return this.projectModel.findById(projectId).exec();
  }

  async findBySlug(orgId: string, slug: string): Promise<ProjectDocument | null> {
    return this.projectModel.findOne({ orgId, slug }).exec();
  }

  async update(
    projectId: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<ProjectDocument> {
    const updateData: any = { ...updateProjectDto };
    
    if (updateProjectDto.name) {
      updateData.slug = this.generateSlug(updateProjectDto.name);
    }

    const project = await this.projectModel.findByIdAndUpdate(
      projectId,
      { $set: updateData },
      { new: true },
    ).exec();

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Delete project and ALL related data (cascade delete)
   */
  async delete(projectId: string, force: boolean = false): Promise<{ deletedCounts: Record<string, number> }> {
    const project = await this.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check for active clusters unless force=true
    if (!force) {
      const activeClusters = await this.connection.collection('clusters').countDocuments({
        projectId: project._id,
        status: { $nin: ['deleting', 'failed'] },
      });
      
      if (activeClusters > 0) {
        throw new BadRequestException({
          code: 'ACTIVE_CLUSTERS_EXIST',
          message: `Cannot delete project with ${activeClusters} active cluster(s). Delete clusters first or use force=true.`,
        });
      }
    }

    this.logger.log(`Starting cascade delete for project ${projectId} (${project.name})`);
    const deletedCounts: Record<string, number> = {};

    // Get all cluster IDs for this project
    const clusters = await this.connection.collection('clusters').find({ projectId: project._id }).toArray();
    const clusterIds = clusters.map(c => c._id);

    this.logger.log(`Found ${clusterIds.length} clusters to delete`);

    // Collections that reference clusterId
    const clusterIdCollections = [
      'backups',
      'backuppolicies',
      'databaseusers',
      'ipwhitelists',
      'searchindexes',
      'vectorindexes',
      'pitrconfigs',
      'pitrrestores',
      'oplogentries',
      'metrics',
      'slowqueries',
      'indexsuggestions',
      'maintenancewindows',
      'logforwardings',
      'archiverules',
      'clusterendpoints',
      'clustersettings',
      'collectionschemas',
      'alertrules',
      'alerthistories',
    ];

    // Delete cluster-related data first
    if (clusterIds.length > 0) {
      for (const collection of clusterIdCollections) {
        try {
          const result = await this.connection.collection(collection).deleteMany({
            clusterId: { $in: clusterIds },
          });
          if (result.deletedCount > 0) {
            deletedCounts[collection] = result.deletedCount;
            this.logger.debug(`Deleted ${result.deletedCount} documents from ${collection}`);
          }
        } catch (err) {
          this.logger.debug(`Collection ${collection} not found or error: ${err.message}`);
        }
      }

      // Delete clusters
      const clusterResult = await this.connection.collection('clusters').deleteMany({
        projectId: project._id,
      });
      if (clusterResult.deletedCount > 0) {
        deletedCounts['clusters'] = clusterResult.deletedCount;
      }
    }

    // Delete project-level data
    const projectCollections = ['privatenetworks', 'events', 'dashboards'];
    for (const collection of projectCollections) {
      try {
        const result = await this.connection.collection(collection).deleteMany({
          projectId: project._id,
        });
        if (result.deletedCount > 0) {
          deletedCounts[collection] = result.deletedCount;
        }
      } catch (err) {
        this.logger.debug(`Collection ${collection} not found or error: ${err.message}`);
      }
    }

    // Finally delete the project
    await this.projectModel.findByIdAndDelete(projectId).exec();
    deletedCounts['projects'] = 1;

    this.logger.log(`Cascade delete complete for project ${projectId}. Summary: ${JSON.stringify(deletedCounts)}`);
    
    return { deletedCounts };
  }

  async getOrgIdForProject(projectId: string): Promise<string | null> {
    const project = await this.findById(projectId);
    return project?.orgId.toString() || null;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}





