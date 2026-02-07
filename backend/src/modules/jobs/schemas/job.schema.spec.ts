import { JobSchema } from './job.schema';
import type { JobType } from './job.schema';

describe('Job Schema', () => {
  it('should include MIGRATE_CLUSTER in the type enum', () => {
    const typePath = JobSchema.path('type') as any;
    const enumValues = typePath.enumValues;

    expect(enumValues).toContain('CREATE_CLUSTER');
    expect(enumValues).toContain('RESIZE_CLUSTER');
    expect(enumValues).toContain('DELETE_CLUSTER');
    expect(enumValues).toContain('PAUSE_CLUSTER');
    expect(enumValues).toContain('RESUME_CLUSTER');
    expect(enumValues).toContain('BACKUP_CLUSTER');
    expect(enumValues).toContain('RESTORE_CLUSTER');
    expect(enumValues).toContain('MIGRATE_CLUSTER');
    expect(enumValues).toContain('SYNC_STATUS');
  });

  it('should have all expected status values', () => {
    const statusPath = JobSchema.path('status') as any;
    const enumValues = statusPath.enumValues;

    expect(enumValues).toContain('pending');
    expect(enumValues).toContain('in_progress');
    expect(enumValues).toContain('success');
    expect(enumValues).toContain('failed');
    expect(enumValues).toContain('canceled');
  });

  it('should have default status of pending', () => {
    const statusPath = JobSchema.path('status') as any;
    expect(statusPath.defaultValue).toBe('pending');
  });

  it('should have default attempts of 0', () => {
    const attemptsPath = JobSchema.path('attempts') as any;
    expect(attemptsPath.defaultValue).toBe(0);
  });

  it('should have default maxAttempts of 3', () => {
    const maxAttemptsPath = JobSchema.path('maxAttempts') as any;
    expect(maxAttemptsPath.defaultValue).toBe(3);
  });

  it('should have indexes on status+createdAt, targetClusterId, and type', () => {
    const indexes = JobSchema.indexes();
    expect(indexes.length).toBeGreaterThanOrEqual(3);

    const hasStatusIndex = indexes.some(
      (idx: any) => idx[0]?.status !== undefined && idx[0]?.createdAt !== undefined,
    );
    expect(hasStatusIndex).toBe(true);

    const hasClusterIndex = indexes.some(
      (idx: any) => idx[0]?.targetClusterId !== undefined,
    );
    expect(hasClusterIndex).toBe(true);

    const hasTypeIndex = indexes.some(
      (idx: any) => idx[0]?.type !== undefined,
    );
    expect(hasTypeIndex).toBe(true);
  });

  it('MIGRATE_CLUSTER should be a valid JobType', () => {
    const migrateType: JobType = 'MIGRATE_CLUSTER';
    expect(migrateType).toBe('MIGRATE_CLUSTER');
  });
});
