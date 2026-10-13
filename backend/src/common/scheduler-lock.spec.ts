import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS, SCHEDULE_INTERVAL_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { Exclusive, setSchedulerLockConnection, tryAcquireSchedulerLock } from './scheduler-lock';

describe('scheduler lock', () => {
  // In-memory stand-in for the schedulerlocks collection with the same upsert semantics.
  const docs = new Map<string, { owner: string; lockedUntil: Date }>();
  const collection = {
    findOneAndUpdate: async (filter: any, update: any) => {
      const existing = docs.get(filter._id);
      const now = filter.$or[0].lockedUntil.$lte as Date;
      const ours = existing && existing.owner === filter.$or[1].owner;
      if (existing && existing.lockedUntil > now && !ours) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      docs.set(filter._id, { owner: update.$set.owner, lockedUntil: update.$set.lockedUntil });
      return null;
    },
  };

  beforeEach(() => {
    docs.clear();
    setSchedulerLockConnection({ collection: () => collection } as any);
  });

  it('lets only one holder run within a lease', async () => {
    expect(await tryAcquireSchedulerLock('job', 60_000)).toBe(true);
    // Simulate another replica holding the lease.
    docs.set('job', { owner: 'other-replica', lockedUntil: new Date(Date.now() + 60_000) });
    expect(await tryAcquireSchedulerLock('job', 60_000)).toBe(false);
    // Expired lease can be taken over.
    docs.set('job', { owner: 'other-replica', lockedUntil: new Date(Date.now() - 1) });
    expect(await tryAcquireSchedulerLock('job', 60_000)).toBe(true);
  });

  it('keeps @Cron/@Interval metadata on the wrapped method and skips when locked', async () => {
    class Jobs {
      runs = 0;
      @Cron(CronExpression.EVERY_HOUR)
      @Exclusive('hourly', 1000)
      async hourly() {
        this.runs += 1;
      }
      @Interval(5000)
      @Exclusive('fast', 1000)
      async fast() {
        this.runs += 1;
      }
    }

    expect(Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, Jobs.prototype.hourly)).toBeDefined();
    expect(Reflect.getMetadata(SCHEDULE_INTERVAL_OPTIONS, Jobs.prototype.fast)).toBeDefined();

    const jobs = new Jobs();
    await jobs.hourly();
    docs.set('hourly', { owner: 'other-replica', lockedUntil: new Date(Date.now() + 60_000) });
    await jobs.hourly();
    expect(jobs.runs).toBe(1);
  });
});
