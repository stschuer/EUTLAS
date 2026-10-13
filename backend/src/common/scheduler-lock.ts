import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { Connection } from 'mongoose';

// Every backend replica runs the same @Cron/@Interval jobs. Without a lock,
// each tick ran once per replica: duplicate scheduled backups, double usage
// records for billing, duplicate auto-scaling resizes, alerts and archiving.
let lockConnection: Connection | undefined;
const owner = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

export function setSchedulerLockConnection(connection: Connection): void {
  lockConnection = connection;
}

/**
 * Lease-based lock in MongoDB: acquired when free, expired, or already ours.
 * The upsert collides on _id while another replica holds an unexpired lease.
 */
export async function tryAcquireSchedulerLock(name: string, leaseMs: number): Promise<boolean> {
  if (!lockConnection) return true; // not wired (unit tests): behave as before
  const now = new Date();
  try {
    await lockConnection.collection<{ _id: string }>('schedulerlocks').findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: { $lte: now } }, { owner }] },
      { $set: { owner, lockedUntil: new Date(now.getTime() + leaseMs), acquiredAt: now } },
      { upsert: true },
    );
    return true;
  } catch (error: any) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

/**
 * Run a scheduled method on one replica per lease window. Place it directly
 * above the method (below @Cron/@Interval) so the scheduler metadata attaches
 * to the wrapped function. Choose a lease a bit shorter than the interval.
 */
export function Exclusive(name: string, leaseMs: number): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      if (!(await tryAcquireSchedulerLock(name, leaseMs))) return;
      return original.apply(this, args);
    };
    return descriptor;
  };
}
