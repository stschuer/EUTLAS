import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument, JobType, JobStatus } from './schemas/job.schema';

interface CreateJobData {
  type: JobType;
  targetClusterId?: string;
  targetProjectId?: string;
  targetOrgId?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
  ) {}

  async createJob(data: CreateJobData): Promise<Job> {
    const job = new this.jobModel({
      type: data.type,
      targetClusterId: data.targetClusterId,
      targetProjectId: data.targetProjectId,
      targetOrgId: data.targetOrgId,
      payload: data.payload,
      status: 'pending' as JobStatus,
      attempts: 0,
      maxAttempts: 3,
    });

    await job.save();
    this.logger.log(`Created job ${job.id} of type ${data.type}`);
    
    return job;
  }

  async findPendingJobs(limit = 10): Promise<JobDocument[]> {
    return this.jobModel
      .find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  async findById(jobId: string): Promise<JobDocument | null> {
    return this.jobModel.findById(jobId).exec();
  }

  async findByClusterId(clusterId: string): Promise<Job[]> {
    return this.jobModel
      .find({ targetClusterId: clusterId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async startJob(jobId: string): Promise<JobDocument | null> {
    return this.jobModel.findByIdAndUpdate(
      jobId,
      {
        $set: { status: 'in_progress', startedAt: new Date() },
        $inc: { attempts: 1 },
      },
      { new: true },
    ).exec();
  }

  async completeJob(
    jobId: string,
    result?: Record<string, unknown>,
  ): Promise<JobDocument | null> {
    return this.jobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'success',
          result,
          completedAt: new Date(),
        },
      },
      { new: true },
    ).exec();
  }

  async failJob(
    jobId: string,
    error: string,
    shouldRetry = true,
  ): Promise<JobDocument | null> {
    const job = await this.findById(jobId);
    if (!job) return null;

    const canRetry = shouldRetry && job.attempts < job.maxAttempts;
    const newStatus: JobStatus = canRetry ? 'pending' : 'failed';

    return this.jobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: newStatus,
          lastError: error,
          ...(newStatus === 'failed' && { completedAt: new Date() }),
        },
      },
      { new: true },
    ).exec();
  }

  async cancelJob(jobId: string): Promise<JobDocument | null> {
    return this.jobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'canceled',
          completedAt: new Date(),
        },
      },
      { new: true },
    ).exec();
  }

  async retryJob(jobId: string): Promise<JobDocument | null> {
    return this.jobModel.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'pending',
          lastError: null,
        },
      },
      { new: true },
    ).exec();
  }

  async getJobStats(): Promise<Record<JobStatus, number>> {
    const stats = await this.jobModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();

    const result: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      success: 0,
      failed: 0,
      canceled: 0,
    };

    stats.forEach((s) => {
      result[s._id] = s.count;
    });

    return result as Record<JobStatus, number>;
  }
}




