import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BackupPolicy, BackupPolicyDocument } from './schemas/backup-policy.schema';
import { UpdateBackupPolicyDto } from './dto/backup-policy.dto';
import { AuditService } from '../audit/audit.service';

// Compliance presets with predefined retention rules
const COMPLIANCE_PRESETS: Record<string, Partial<BackupPolicy>> = {
  standard: {
    snapshotFrequencyHours: 24,
    snapshotRetentionDays: 7,
    pitrEnabled: false,
    retentionRules: {
      daily: { keep: 7 },
      weekly: { keep: 4 },
    },
    complianceTags: [],
  },
  gdpr: {
    snapshotFrequencyHours: 12,
    snapshotRetentionDays: 30,
    pitrEnabled: true,
    pitrRetentionDays: 7,
    encryptionEnabled: true,
    retentionRules: {
      daily: { keep: 30 },
      weekly: { keep: 12 },
      monthly: { keep: 12 },
    },
    complianceTags: ['gdpr', 'eu-data', 'data-protection'],
  },
  hipaa: {
    snapshotFrequencyHours: 6,
    snapshotRetentionDays: 90,
    pitrEnabled: true,
    pitrRetentionDays: 14,
    encryptionEnabled: true,
    crossRegionEnabled: true,
    retentionRules: {
      daily: { keep: 90 },
      weekly: { keep: 52 },
      monthly: { keep: 84 }, // 7 years
    },
    complianceTags: ['hipaa', 'phi', 'healthcare'],
    alertOnFailure: true,
  },
  'pci-dss': {
    snapshotFrequencyHours: 4,
    snapshotRetentionDays: 90,
    pitrEnabled: true,
    pitrRetentionDays: 14,
    encryptionEnabled: true,
    retentionRules: {
      daily: { keep: 90 },
      weekly: { keep: 52 },
      monthly: { keep: 12 },
    },
    complianceTags: ['pci-dss', 'payment', 'cardholder'],
    alertOnFailure: true,
  },
  sox: {
    snapshotFrequencyHours: 12,
    snapshotRetentionDays: 365,
    pitrEnabled: true,
    pitrRetentionDays: 30,
    encryptionEnabled: true,
    retentionRules: {
      daily: { keep: 365 },
      weekly: { keep: 260 }, // 5 years
      monthly: { keep: 84 },  // 7 years
    },
    complianceTags: ['sox', 'financial', 'audit'],
    alertOnFailure: true,
    legalHoldEnabled: false, // Can be enabled per audit
  },
};

@Injectable()
export class BackupPolicyService {
  private readonly logger = new Logger(BackupPolicyService.name);

  constructor(
    @InjectModel(BackupPolicy.name) private policyModel: Model<BackupPolicyDocument>,
    private auditService: AuditService,
  ) {}

  async getOrCreate(clusterId: string): Promise<BackupPolicy> {
    let policy = await this.policyModel.findOne({
      clusterId: new Types.ObjectId(clusterId),
    });

    if (!policy) {
      policy = new this.policyModel({
        clusterId: new Types.ObjectId(clusterId),
        ...COMPLIANCE_PRESETS.standard,
        complianceLevel: 'standard',
      });
      await policy.save();
      this.logger.log(`Created default backup policy for cluster ${clusterId}`);
    }

    return policy;
  }

  async update(
    clusterId: string,
    dto: UpdateBackupPolicyDto,
    userId: string,
    orgId?: string,
    projectId?: string,
  ): Promise<BackupPolicy> {
    const policy = await this.getOrCreate(clusterId);

    // Apply updates using findByIdAndUpdate
    const updated = await this.policyModel.findByIdAndUpdate(
      policy.id,
      { ...dto, updatedBy: new Types.ObjectId(userId) },
      { new: true },
    );

    // Audit log
    if (orgId) {
      await this.auditService.log({
        orgId,
        projectId,
        action: 'UPDATE',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        description: `Updated backup policy: ${JSON.stringify(dto)}`,
      });
    }

    this.logger.log(`Updated backup policy for cluster ${clusterId}`);
    return updated || policy;
  }

  async applyCompliancePreset(
    clusterId: string,
    preset: string,
    userId: string,
    orgId?: string,
    projectId?: string,
  ): Promise<BackupPolicy> {
    const presetConfig = COMPLIANCE_PRESETS[preset];
    if (!presetConfig) {
      throw new NotFoundException(`Compliance preset '${preset}' not found`);
    }

    const policy = await this.getOrCreate(clusterId);

    const updated = await this.policyModel.findByIdAndUpdate(
      policy.id,
      {
        ...presetConfig,
        complianceLevel: preset,
        updatedBy: new Types.ObjectId(userId),
      },
      { new: true },
    );

    if (orgId) {
      await this.auditService.log({
        orgId,
        projectId,
        action: 'UPDATE',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        description: `Applied compliance preset: ${preset}`,
      });
    }

    this.logger.log(`Applied ${preset} compliance preset to cluster ${clusterId}`);
    return updated || policy;
  }

  async enableLegalHold(
    clusterId: string,
    reason: string,
    untilDate: Date | null,
    userId: string,
    orgId?: string,
    projectId?: string,
  ): Promise<BackupPolicy> {
    const policy = await this.getOrCreate(clusterId);

    await this.policyModel.findByIdAndUpdate(policy.id, {
      legalHoldEnabled: true,
      legalHoldReason: reason,
      legalHoldUntil: untilDate || undefined,
      updatedBy: new Types.ObjectId(userId),
    });

    if (orgId) {
      await this.auditService.log({
        orgId,
        projectId,
        action: 'UPDATE',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        description: `Enabled legal hold: ${reason}`,
      });
    }

    this.logger.log(`Enabled legal hold on cluster ${clusterId}: ${reason}`);
    return policy;
  }

  async disableLegalHold(
    clusterId: string,
    userId: string,
    orgId?: string,
    projectId?: string,
  ): Promise<BackupPolicy> {
    const policy = await this.getOrCreate(clusterId);

    await this.policyModel.findByIdAndUpdate(policy.id, {
      legalHoldEnabled: false,
      $unset: { legalHoldReason: 1, legalHoldUntil: 1 },
      updatedBy: new Types.ObjectId(userId),
    });

    if (orgId) {
      await this.auditService.log({
        orgId,
        projectId,
        action: 'UPDATE',
        resourceType: 'cluster',
        resourceId: clusterId,
        actorId: userId,
        description: 'Disabled legal hold',
      });
    }

    return policy;
  }

  getCompliancePresets(): Array<{ name: string; description: string; features: string[] }> {
    return [
      {
        name: 'standard',
        description: 'Basic backup policy suitable for development and non-critical workloads',
        features: ['Daily snapshots', '7-day retention', 'Encryption enabled'],
      },
      {
        name: 'gdpr',
        description: 'GDPR-compliant backup policy for EU data protection requirements',
        features: ['12-hour snapshots', '30-day retention', 'PITR enabled', 'EU data tags', '12-month archive'],
      },
      {
        name: 'hipaa',
        description: 'HIPAA-compliant backup policy for healthcare data',
        features: ['6-hour snapshots', '90-day retention', 'PITR enabled', '7-year archive', 'Cross-region backup'],
      },
      {
        name: 'pci-dss',
        description: 'PCI-DSS compliant backup policy for payment card data',
        features: ['4-hour snapshots', '90-day retention', 'PITR enabled', 'Encryption required', 'Alert on failure'],
      },
      {
        name: 'sox',
        description: 'SOX-compliant backup policy for financial reporting data',
        features: ['12-hour snapshots', '365-day retention', 'PITR enabled', '7-year archive', 'Legal hold support'],
      },
    ];
  }

  async getComplianceStatus(clusterId: string): Promise<{
    compliant: boolean;
    level: string;
    issues: string[];
    recommendations: string[];
  }> {
    const policy = await this.getOrCreate(clusterId);
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check common compliance requirements
    if (!policy.encryptionEnabled) {
      issues.push('Encryption is disabled');
    }

    if (policy.snapshotRetentionDays < 7) {
      issues.push('Snapshot retention is below minimum (7 days)');
    }

    if (policy.complianceLevel !== 'standard') {
      // Check specific compliance requirements
      if (!policy.pitrEnabled && ['hipaa', 'pci-dss', 'sox', 'gdpr'].includes(policy.complianceLevel)) {
        issues.push('PITR should be enabled for this compliance level');
      }

      if (!policy.alertOnFailure) {
        recommendations.push('Enable backup failure alerts');
      }

      if (!policy.crossRegionEnabled && policy.complianceLevel === 'hipaa') {
        recommendations.push('Consider enabling cross-region backup for disaster recovery');
      }
    }

    if (policy.alertRecipients.length === 0 && policy.alertOnFailure) {
      issues.push('No alert recipients configured');
    }

    return {
      compliant: issues.length === 0,
      level: policy.complianceLevel,
      issues,
      recommendations,
    };
  }
}

