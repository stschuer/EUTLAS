import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillingAccount, BillingAccountDocument, PaymentMethodType } from '../schemas/billing-account.schema';
import { CreateBillingAccountDto, UpdateBillingAccountDto } from '../dto/billing.dto';

@Injectable()
export class BillingAccountService {
  private readonly logger = new Logger(BillingAccountService.name);

  constructor(
    @InjectModel(BillingAccount.name) private billingAccountModel: Model<BillingAccountDocument>,
  ) {}

  // ==================== CRUD ====================

  async create(orgId: string, createDto: CreateBillingAccountDto): Promise<BillingAccount> {
    const existing = await this.billingAccountModel.findOne({ orgId }).exec();
    if (existing) {
      throw new BadRequestException('Billing account already exists for this organization');
    }

    const account = new this.billingAccountModel({
      orgId: new Types.ObjectId(orgId),
      companyName: createDto.companyName,
      billingEmail: createDto.billingEmail,
      billingName: createDto.billingName,
      address: createDto.address,
      vatId: createDto.vatId,
      currency: createDto.currency || 'EUR',
    });

    await account.save();
    this.logger.log(`Created billing account for org ${orgId}`);
    return account;
  }

  async findByOrgId(orgId: string): Promise<BillingAccount | null> {
    return this.billingAccountModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
  }

  async findById(accountId: string): Promise<BillingAccount | null> {
    return this.billingAccountModel.findById(accountId).exec();
  }

  async update(orgId: string, updateDto: UpdateBillingAccountDto): Promise<BillingAccount> {
    const account = await this.billingAccountModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
    if (!account) {
      throw new NotFoundException('Billing account not found');
    }

    if (updateDto.companyName !== undefined) account.companyName = updateDto.companyName;
    if (updateDto.billingEmail !== undefined) account.billingEmail = updateDto.billingEmail;
    if (updateDto.billingName !== undefined) account.billingName = updateDto.billingName;
    if (updateDto.address !== undefined) account.address = { ...account.address, ...updateDto.address };
    if (updateDto.vatId !== undefined) account.vatId = updateDto.vatId;
    if (updateDto.taxPercent !== undefined) account.taxPercent = updateDto.taxPercent;
    if (updateDto.billingCycle !== undefined) account.billingCycle = updateDto.billingCycle;
    if (updateDto.billingDay !== undefined) account.billingDay = updateDto.billingDay;

    await account.save();
    return account;
  }

  // ==================== Payment Method (Prepared for Stripe) ====================

  async setPaymentMethod(
    orgId: string,
    type: PaymentMethodType,
    details?: {
      last4?: string;
      brand?: string;
      expiryMonth?: number;
      expiryYear?: number;
      bankName?: string;
      stripePaymentMethodId?: string;
    },
  ): Promise<BillingAccount> {
    const account = await this.billingAccountModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
    if (!account) {
      throw new NotFoundException('Billing account not found');
    }

    account.paymentMethodType = type;
    
    if (type !== 'none' && details) {
      account.paymentMethod = {
        type,
        last4: details.last4,
        brand: details.brand,
        expiryMonth: details.expiryMonth,
        expiryYear: details.expiryYear,
        bankName: details.bankName,
      };
      
      if (details.stripePaymentMethodId) {
        account.stripePaymentMethodId = details.stripePaymentMethodId;
      }
    } else {
      account.paymentMethod = undefined;
    }

    await account.save();
    this.logger.log(`Updated payment method for org ${orgId}: ${type}`);
    return account;
  }

  async removePaymentMethod(orgId: string): Promise<BillingAccount> {
    return this.setPaymentMethod(orgId, 'none');
  }

  // ==================== Stripe Integration (Prepared) ====================

  async setStripeCustomerId(orgId: string, stripeCustomerId: string): Promise<void> {
    await this.billingAccountModel.findOneAndUpdate(
      { orgId: new Types.ObjectId(orgId) },
      { $set: { stripeCustomerId } },
    ).exec();
  }

  async setStripeSubscriptionId(orgId: string, stripeSubscriptionId: string): Promise<void> {
    await this.billingAccountModel.findOneAndUpdate(
      { orgId: new Types.ObjectId(orgId) },
      { $set: { stripeSubscriptionId } },
    ).exec();
  }

  async getByStripeCustomerId(stripeCustomerId: string): Promise<BillingAccount | null> {
    return this.billingAccountModel.findOne({ stripeCustomerId }).exec();
  }

  // ==================== Credits ====================

  async addCredit(orgId: string, amountCents: number, description?: string): Promise<BillingAccount> {
    const account = await this.billingAccountModel.findOneAndUpdate(
      { orgId: new Types.ObjectId(orgId) },
      { $inc: { creditBalanceCents: amountCents } },
      { new: true },
    ).exec();

    if (!account) {
      throw new NotFoundException('Billing account not found');
    }

    this.logger.log(`Added ${amountCents} cents credit to org ${orgId}: ${description || 'No description'}`);
    return account;
  }

  async useCredit(orgId: string, amountCents: number): Promise<{ used: number; remaining: number }> {
    const account = await this.billingAccountModel.findOne({ orgId: new Types.ObjectId(orgId) }).exec();
    if (!account) {
      throw new NotFoundException('Billing account not found');
    }

    const used = Math.min(amountCents, account.creditBalanceCents);
    
    if (used > 0) {
      account.creditBalanceCents -= used;
      await account.save();
    }

    return {
      used,
      remaining: amountCents - used,
    };
  }

  // ==================== Status ====================

  async setDelinquent(orgId: string, delinquent: boolean): Promise<void> {
    await this.billingAccountModel.findOneAndUpdate(
      { orgId: new Types.ObjectId(orgId) },
      {
        $set: {
          delinquent,
          ...(delinquent ? { delinquentSince: new Date() } : { delinquentSince: undefined }),
        },
      },
    ).exec();
  }

  async getDelinquentAccounts(): Promise<BillingAccount[]> {
    return this.billingAccountModel.find({ delinquent: true }).exec();
  }
}

