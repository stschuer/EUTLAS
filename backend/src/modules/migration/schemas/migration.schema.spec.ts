import { MigrationSchema } from './migration.schema';

describe('Migration Schema', () => {
  it('should have the required fields', () => {
    const paths = MigrationSchema.paths;

    expect(paths).toHaveProperty('targetClusterId');
    expect(paths).toHaveProperty('targetProjectId');
    expect(paths).toHaveProperty('targetOrgId');
    expect(paths).toHaveProperty('sourceUri');
    expect(paths).toHaveProperty('sourceProvider');
    expect(paths).toHaveProperty('status');
    expect(paths).toHaveProperty('progress');
    expect(paths).toHaveProperty('options');
    expect(paths).toHaveProperty('stats');
    expect(paths).toHaveProperty('databaseProgress');
    expect(paths).toHaveProperty('log');
    expect(paths).toHaveProperty('createdBy');
  });

  it('should have correct status enum values', () => {
    const statusPath = MigrationSchema.path('status') as any;
    const enumValues = statusPath.enumValues;

    expect(enumValues).toContain('pending');
    expect(enumValues).toContain('validating');
    expect(enumValues).toContain('analyzing');
    expect(enumValues).toContain('dumping');
    expect(enumValues).toContain('restoring');
    expect(enumValues).toContain('verifying');
    expect(enumValues).toContain('completed');
    expect(enumValues).toContain('failed');
    expect(enumValues).toContain('cancelled');
  });

  it('should have correct sourceProvider enum values', () => {
    const providerPath = MigrationSchema.path('sourceProvider') as any;
    const enumValues = providerPath.enumValues;

    expect(enumValues).toContain('atlas');
    expect(enumValues).toContain('self-hosted');
    expect(enumValues).toContain('digitalocean');
    expect(enumValues).toContain('aws-documentdb');
    expect(enumValues).toContain('other');
  });

  it('should have default values', () => {
    const statusPath = MigrationSchema.path('status') as any;
    expect(statusPath.defaultValue).toBe('pending');

    const progressPath = MigrationSchema.path('progress') as any;
    expect(progressPath.defaultValue).toBe(0);
  });

  it('should have indexes', () => {
    const indexes = MigrationSchema.indexes();
    expect(indexes.length).toBeGreaterThan(0);

    // Check for targetClusterId index
    const hasClusterIndex = indexes.some(
      (idx: any) => idx[0]?.targetClusterId !== undefined,
    );
    expect(hasClusterIndex).toBe(true);

    // Check for status index
    const hasStatusIndex = indexes.some(
      (idx: any) => idx[0]?.status !== undefined,
    );
    expect(hasStatusIndex).toBe(true);
  });

  it('should mask sourceUri in JSON transform', () => {
    const toJSON = (MigrationSchema as any).options?.toJSON;
    expect(toJSON).toBeDefined();
    expect(toJSON.transform).toBeDefined();

    // Test the transform function
    const transform = toJSON.transform;
    const doc = {};
    const ret = {
      _id: 'abc123',
      __v: 0,
      sourceUri: 'mongodb://admin:supersecret@cluster.mongodb.net/mydb',
    };

    const result = transform(doc, ret);
    expect(result.id).toBe('abc123');
    expect(result._id).toBeUndefined();
    expect(result.__v).toBeUndefined();
    expect(result.sourceUri).not.toContain('supersecret');
    expect(result.sourceUri).toContain('****');
  });
});
