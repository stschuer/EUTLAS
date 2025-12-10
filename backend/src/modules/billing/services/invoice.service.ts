import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument, InvoiceLineItem, InvoiceStatus } from '../schemas/invoice.schema';
import { BillingAccount, BillingAccountDocument } from '../schemas/billing-account.schema';
import { UsageService } from './usage.service';
import { PricingService } from './pricing.service';
import { Cluster, ClusterDocument } from '../../clusters/schemas/cluster.schema';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(BillingAccount.name) private billingAccountModel: Model<BillingAccountDocument>,
    @InjectModel(Cluster.name) private clusterModel: Model<ClusterDocument>,
    private readonly usageService: UsageService,
    private readonly pricingService: PricingService,
  ) {}

  // ==================== Invoice Generation ====================

  async generateInvoice(
    orgId: string,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    options?: { notes?: string },
  ): Promise<Invoice> {
    // Get billing account
    const billingAccount = await this.billingAccountModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
    if (!billingAccount) {
      throw new BadRequestException('Billing account not found. Please set up billing first.');
    }

    // Check for existing invoice for this period
    const existing = await this.invoiceModel.findOne({
      orgId,
      billingPeriodStart,
      billingPeriodEnd,
      status: { $ne: 'void' },
    }).exec();

    if (existing) {
      throw new BadRequestException('Invoice already exists for this billing period');
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    // Get clusters for this org
    const clusters = await this.clusterModel.find({ orgId }).exec();

    // Build line items
    const lineItems: InvoiceLineItem[] = [];

    // 1. Add plan charges for each cluster
    for (const cluster of clusters) {
      const planPrice = await this.pricingService.getPlanPrice(cluster.plan);
      if (planPrice) {
        // Calculate pro-rated amount based on cluster creation date
        const clusterStart = cluster.createdAt > billingPeriodStart ? cluster.createdAt : billingPeriodStart;
        const daysInPeriod = this.daysBetween(billingPeriodStart, billingPeriodEnd);
        const daysActive = this.daysBetween(clusterStart, billingPeriodEnd);
        const proRatedAmount = Math.round((planPrice.unitAmountCents || 0) * (daysActive / daysInPeriod));

        lineItems.push({
          description: `${planPrice.name} - ${cluster.name}`,
          quantity: 1,
          unit: 'month',
          unitPriceCents: planPrice.unitAmountCents || 0,
          totalCents: proRatedAmount,
          usageType: 'plan',
          clusterId: cluster._id.toString(),
          clusterName: cluster.name,
          periodStart: clusterStart,
          periodEnd: billingPeriodEnd,
        });
      }
    }

    // 2. Add usage charges
    const usageRecords = await this.usageService.getUninvoicedUsage(orgId, billingPeriodEnd);
    
    // Group usage by cluster and type
    const usageByClusterType = new Map<string, {
      clusterId?: string;
      clusterName?: string;
      usageType: string;
      quantity: number;
      totalCents: number;
    }>();

    for (const record of usageRecords) {
      const key = `${record.clusterId || 'org'}_${record.usageType}`;
      const existing = usageByClusterType.get(key) || {
        clusterId: record.clusterId?.toString(),
        clusterName: record.metadata?.clusterName,
        usageType: record.usageType,
        quantity: 0,
        totalCents: 0,
      };
      existing.quantity += record.quantity;
      existing.totalCents += record.totalCents;
      usageByClusterType.set(key, existing);
    }

    for (const usage of usageByClusterType.values()) {
      if (usage.totalCents > 0) {
        const price = await this.pricingService.getPriceForUsageType(usage.usageType as any);
        lineItems.push({
          description: `${price?.name || usage.usageType}${usage.clusterName ? ` - ${usage.clusterName}` : ''}`,
          quantity: usage.quantity,
          unit: price?.unit || 'unit',
          unitPriceCents: price?.perUnitAmountCents || 0,
          totalCents: usage.totalCents,
          usageType: usage.usageType,
          clusterId: usage.clusterId,
          clusterName: usage.clusterName,
          periodStart: billingPeriodStart,
          periodEnd: billingPeriodEnd,
        });
      }
    }

    // Calculate totals
    const subtotalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);
    const taxCents = Math.round(subtotalCents * (billingAccount.taxPercent / 100));
    const totalCents = subtotalCents + taxCents;

    // Create invoice
    const dueDate = new Date(billingPeriodEnd);
    dueDate.setDate(dueDate.getDate() + billingAccount.paymentTermDays);

    const invoice = new this.invoiceModel({
      invoiceNumber,
      orgId: new Types.ObjectId(orgId),
      billingAccountId: billingAccount._id,
      status: 'draft',
      currency: billingAccount.currency,
      billingPeriodStart,
      billingPeriodEnd,
      lineItems,
      subtotalCents,
      taxPercent: billingAccount.taxPercent,
      taxCents,
      totalCents,
      dueDate,
      billingDetails: {
        companyName: billingAccount.companyName,
        name: billingAccount.billingName || '',
        email: billingAccount.billingEmail,
        address: billingAccount.address,
        vatId: billingAccount.vatId,
      },
      notes: options?.notes,
    });

    await invoice.save();

    // Mark usage as invoiced
    const usageIds = usageRecords.map(r => r.id);
    if (usageIds.length > 0) {
      await this.usageService.markUsageAsInvoiced(usageIds, invoice.id);
    }

    this.logger.log(`Generated invoice ${invoiceNumber} for org ${orgId}: ${this.pricingService.formatAmount(totalCents)}`);
    return invoice;
  }

  // ==================== Invoice Queries ====================

  async findByOrg(orgId: string, status?: InvoiceStatus): Promise<Invoice[]> {
    const query: any = { orgId };
    if (status) {
      query.status = status;
    }
    return this.invoiceModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findById(invoiceId: string): Promise<Invoice | null> {
    return this.invoiceModel.findById(invoiceId).exec();
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null> {
    return this.invoiceModel.findOne({ invoiceNumber }).exec();
  }

  async getInvoiceStats(orgId: string): Promise<{
    totalPaid: number;
    totalOpen: number;
    totalOverdue: number;
    invoiceCount: number;
  }> {
    const now = new Date();
    
    const [paid, open, overdue, count] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: { orgId: new Types.ObjectId(orgId), status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalCents' } } },
      ]).exec(),
      
      this.invoiceModel.aggregate([
        { $match: { orgId: new Types.ObjectId(orgId), status: 'open' } },
        { $group: { _id: null, total: { $sum: '$totalCents' } } },
      ]).exec(),
      
      this.invoiceModel.aggregate([
        { $match: { orgId: new Types.ObjectId(orgId), status: 'open', dueDate: { $lt: now } } },
        { $group: { _id: null, total: { $sum: '$totalCents' } } },
      ]).exec(),
      
      this.invoiceModel.countDocuments({ orgId }).exec(),
    ]);

    return {
      totalPaid: paid[0]?.total || 0,
      totalOpen: open[0]?.total || 0,
      totalOverdue: overdue[0]?.total || 0,
      invoiceCount: count,
    };
  }

  // ==================== Invoice Actions ====================

  async finalizeInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(invoiceId).exec();
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be finalized');
    }

    invoice.status = 'open';
    await invoice.save();

    this.logger.log(`Finalized invoice ${invoice.invoiceNumber}`);
    return invoice;
  }

  async markAsPaid(
    invoiceId: string,
    paidAt?: Date,
    paymentReference?: string,
  ): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(invoiceId).exec();
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'paid') {
      throw new BadRequestException('Invoice is already paid');
    }

    if (invoice.status === 'void') {
      throw new BadRequestException('Cannot pay a voided invoice');
    }

    invoice.status = 'paid';
    invoice.paidAt = paidAt || new Date();
    if (paymentReference) {
      invoice.notes = `${invoice.notes || ''}\nPayment ref: ${paymentReference}`.trim();
    }

    await invoice.save();

    // Update billing account delinquent status
    await this.updateDelinquentStatus(invoice.orgId.toString());

    this.logger.log(`Marked invoice ${invoice.invoiceNumber} as paid`);
    return invoice;
  }

  async voidInvoice(invoiceId: string, reason: string): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(invoiceId).exec();
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'paid') {
      throw new BadRequestException('Cannot void a paid invoice');
    }

    if (invoice.status === 'void') {
      throw new BadRequestException('Invoice is already voided');
    }

    invoice.status = 'void';
    invoice.voidedAt = new Date();
    invoice.voidReason = reason;

    await invoice.save();

    this.logger.log(`Voided invoice ${invoice.invoiceNumber}: ${reason}`);
    return invoice;
  }

  async applyDiscount(
    invoiceId: string,
    discountCents: number,
    description?: string,
  ): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(invoiceId).exec();
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'draft' && invoice.status !== 'open') {
      throw new BadRequestException('Cannot apply discount to this invoice');
    }

    invoice.discountCents = discountCents;
    invoice.discountDescription = description;
    invoice.totalCents = invoice.subtotalCents - discountCents + invoice.taxCents;

    await invoice.save();
    return invoice;
  }

  // ==================== Helpers ====================

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    
    const lastInvoice = await this.invoiceModel
      .findOne({ invoiceNumber: { $regex: `^${prefix}` } })
      .sort({ invoiceNumber: -1 })
      .exec();

    let nextNumber = 1;
    if (lastInvoice) {
      const lastNumber = parseInt(lastInvoice.invoiceNumber.replace(prefix, ''), 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  private daysBetween(start: Date, end: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((end.getTime() - start.getTime()) / oneDay)) + 1;
  }

  private async updateDelinquentStatus(orgId: string): Promise<void> {
    const now = new Date();
    const overdueCount = await this.invoiceModel.countDocuments({
      orgId,
      status: 'open',
      dueDate: { $lt: now },
    }).exec();

    await this.billingAccountModel.findOneAndUpdate(
      { orgId },
      {
        $set: {
          delinquent: overdueCount > 0,
          ...(overdueCount > 0 ? {} : { delinquentSince: undefined }),
        },
      },
    ).exec();
  }
}

