import { EventSchema } from './event.schema';

describe('EventSchema', () => {
  it('should allow migration event types in enum validation', () => {
    const typePath = EventSchema.path('type') as any;
    const enumValues: string[] = typePath.enumValues || [];

    expect(enumValues).toContain('MIGRATION_STARTED');
    expect(enumValues).toContain('MIGRATION_COMPLETED');
    expect(enumValues).toContain('MIGRATION_FAILED');
    expect(enumValues).toContain('MIGRATION_CANCELLED');
  });
});
