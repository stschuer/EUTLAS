import { Types } from 'mongoose';

/**
 * Several references (e.g. backups.clusterId) are stored as strings even though
 * their schemas declare ObjectId — `@Prop({ type: Types.ObjectId })` does not
 * cast. Raw queries must match both representations.
 */
export function idVariants(id: string | Types.ObjectId): Array<string | Types.ObjectId> {
  const s = id.toString();
  return Types.ObjectId.isValid(s) ? [new Types.ObjectId(s), s] : [s];
}
