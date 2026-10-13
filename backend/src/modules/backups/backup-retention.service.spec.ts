import { Types } from 'mongoose';
import { BackupRetentionService } from './backup-retention.service';

const chain = (value: any) => {
  const q: any = {};
  for (const m of ['select', 'limit', 'sort', 'lean']) q[m] = jest.fn().mockReturnValue(q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

describe('BackupRetentionService', () => {
  const clusterA = new Types.ObjectId();
  const clusterB = new Types.ObjectId();
  const projectId = new Types.ObjectId();
  const now = new Date('2026-10-12T18:00:00Z');

  let model: any;
  let kubernetes: any;
  let service: BackupRetentionService;

  const backup = (clusterId: Types.ObjectId) => ({ _id: new Types.ObjectId(), clusterId, projectId });

  beforeEach(() => {
    model = {
      find: jest.fn(),
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
      collection: { dropIndex: jest.fn(), findOne: jest.fn() },
    };
    kubernetes = { purgeBackupArchives: jest.fn().mockResolvedValue(undefined) };
    service = new BackupRetentionService(model, { get: jest.fn() } as any, kubernetes);
  });

  it('purges due backups per cluster but always keeps the newest completed one', async () => {
    const a1 = backup(clusterA);
    const a2 = backup(clusterA);
    const b1 = backup(clusterB);
    model.find.mockReturnValue(chain([a1, a2, b1]));
    // a2 is cluster A's newest completed backup; cluster B's newest is a different one.
    model.collection.findOne
      .mockResolvedValueOnce({ _id: a2._id })
      .mockResolvedValueOnce({ _id: new Types.ObjectId() });

    const purged = await service.runPurge(now);

    expect(purged).toBe(2);
    expect(kubernetes.purgeBackupArchives).toHaveBeenCalledWith({
      clusterId: clusterA.toString(),
      projectId: projectId.toString(),
      backupIds: [a1._id.toString()],
    });
    expect(kubernetes.purgeBackupArchives).toHaveBeenCalledWith({
      clusterId: clusterB.toString(),
      projectId: projectId.toString(),
      backupIds: [b1._id.toString()],
    });
    // Newest-completed lookup must match string-stored clusterIds too.
    expect(model.collection.findOne.mock.calls[0][0].clusterId.$in).toContain(clusterA.toString());
    expect(model.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [a1._id] } },
      { $set: { status: 'deleted', purgedAt: now } },
    );
  });

  it('skips a cluster whose only due backup is its newest completed one', async () => {
    const only = backup(clusterA);
    model.find.mockReturnValue(chain([only]));
    model.collection.findOne.mockResolvedValue({ _id: only._id });

    expect(await service.runPurge(now)).toBe(0);
    expect(kubernetes.purgeBackupArchives).not.toHaveBeenCalled();
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('leaves records untouched when removing the archives fails', async () => {
    model.find.mockReturnValue(chain([backup(clusterA)]));
    model.collection.findOne.mockResolvedValue(null);
    kubernetes.purgeBackupArchives.mockRejectedValue(new Error('job failed'));

    expect(await service.runPurge(now)).toBe(0);
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('fails backups abandoned in pending/in_progress for over 2h', async () => {
    model.updateMany.mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });

    expect(await service.failStaleBackups(now)).toBe(1);
    const [filter, update] = model.updateMany.mock.calls[0];
    expect(filter).toEqual({
      status: { $in: ['pending', 'in_progress'] },
      updatedAt: { $lte: new Date('2026-10-12T16:00:00Z') },
    });
    expect(update.$set.status).toBe('failed');
  });

  it('ignores a missing legacy TTL index on startup', async () => {
    model.collection.dropIndex.mockRejectedValue({ code: 27, codeName: 'IndexNotFound' });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
