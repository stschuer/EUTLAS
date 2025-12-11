import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
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

  async delete(projectId: string): Promise<void> {
    // TODO: Check for active clusters before deletion
    await this.projectModel.findByIdAndDelete(projectId).exec();
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



