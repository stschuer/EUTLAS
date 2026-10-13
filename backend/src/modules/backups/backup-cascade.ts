import { Connection, Types } from 'mongoose';

/**
 * Cascade deletes must not hard-delete backup records: their archives (staged
 * copy and off-site object) would be orphaned with nothing left to find them.
 * Marking them 'deleted' lets BackupRetentionService purge the archives and
 * then stamp purgedAt.
 */
export async function markBackupsDeletedForClusters(
  connection: Connection,
  clusterIds: Types.ObjectId[],
): Promise<number> {
  if (clusterIds.length === 0) return 0;
  const result = await connection.collection('backups').updateMany(
    { clusterId: { $in: clusterIds }, purgedAt: { $exists: false } },
    { $set: { status: 'deleted', updatedAt: new Date() } },
  );
  return result.modifiedCount;
}
