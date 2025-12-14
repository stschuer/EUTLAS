// MongoDB initialization script for development
// This runs when the MongoDB container starts for the first time

db = db.getSiblingDB('eutlas');

// Create indexes for better query performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ verificationToken: 1 });
db.users.createIndex({ passwordResetToken: 1 });

db.organizations.createIndex({ slug: 1 }, { unique: true });
db.organizations.createIndex({ ownerId: 1 });

db.orgmembers.createIndex({ orgId: 1, userId: 1 }, { unique: true });
db.orgmembers.createIndex({ userId: 1 });

db.projects.createIndex({ orgId: 1, slug: 1 }, { unique: true });
db.projects.createIndex({ orgId: 1 });

db.clusters.createIndex({ projectId: 1, name: 1 }, { unique: true });
db.clusters.createIndex({ projectId: 1 });
db.clusters.createIndex({ orgId: 1 });
db.clusters.createIndex({ status: 1 });

db.jobs.createIndex({ status: 1, createdAt: 1 });
db.jobs.createIndex({ targetClusterId: 1 });
db.jobs.createIndex({ type: 1 });

db.backups.createIndex({ clusterId: 1, createdAt: -1 });
db.backups.createIndex({ status: 1 });

db.events.createIndex({ clusterId: 1, createdAt: -1 });
db.events.createIndex({ projectId: 1, createdAt: -1 });
db.events.createIndex({ orgId: 1, createdAt: -1 });

print('✅ MongoDB initialized with EUTLAS indexes');




