import { ClusterStatus, JobStatus, BackupStatus } from '../types';

export const CLUSTER_STATUS_CONFIG: Record<ClusterStatus, {
  label: string;
  color: string;
  isTerminal: boolean;
  allowsOperations: boolean;
}> = {
  creating: {
    label: 'Creating',
    color: 'yellow',
    isTerminal: false,
    allowsOperations: false,
  },
  ready: {
    label: 'Ready',
    color: 'green',
    isTerminal: false,
    allowsOperations: true,
  },
  updating: {
    label: 'Updating',
    color: 'blue',
    isTerminal: false,
    allowsOperations: false,
  },
  deleting: {
    label: 'Deleting',
    color: 'red',
    isTerminal: false,
    allowsOperations: false,
  },
  failed: {
    label: 'Failed',
    color: 'red',
    isTerminal: true,
    allowsOperations: false,
  },
  degraded: {
    label: 'Degraded',
    color: 'orange',
    isTerminal: false,
    allowsOperations: true,
  },
  stopped: {
    label: 'Stopped',
    color: 'gray',
    isTerminal: false,
    allowsOperations: false,
  },
};

export const JOB_STATUS_CONFIG: Record<JobStatus, {
  label: string;
  color: string;
  isTerminal: boolean;
}> = {
  pending: { label: 'Pending', color: 'gray', isTerminal: false },
  in_progress: { label: 'In Progress', color: 'blue', isTerminal: false },
  success: { label: 'Success', color: 'green', isTerminal: true },
  failed: { label: 'Failed', color: 'red', isTerminal: true },
  canceled: { label: 'Canceled', color: 'gray', isTerminal: true },
};

export const BACKUP_STATUS_CONFIG: Record<BackupStatus, {
  label: string;
  color: string;
}> = {
  scheduled: { label: 'Scheduled', color: 'gray' },
  running: { label: 'Running', color: 'blue' },
  success: { label: 'Completed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
};




