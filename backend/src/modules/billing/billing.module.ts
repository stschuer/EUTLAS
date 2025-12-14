import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BillingController } from './billing.controller';
import { BillingAccountService } from './services/billing-account.service';
import { InvoiceService } from './services/invoice.service';
import { UsageService } from './services/usage.service';
import { PricingService } from './services/pricing.service';
import { StripeService } from './services/stripe.service';
import { UsageRecord, UsageRecordSchema } from './schemas/usage-record.schema';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';
import { BillingAccount, BillingAccountSchema } from './schemas/billing-account.schema';
import { Price, PriceSchema } from './schemas/price.schema';
import { Cluster, ClusterSchema } from '../clusters/schemas/cluster.schema';
import { OrgsModule } from '../orgs/orgs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UsageRecord.name, schema: UsageRecordSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: BillingAccount.name, schema: BillingAccountSchema },
      { name: Price.name, schema: PriceSchema },
      { name: Cluster.name, schema: ClusterSchema },
    ]),
    forwardRef(() => OrgsModule),
  ],
  controllers: [BillingController],
  providers: [
    BillingAccountService,
    InvoiceService,
    UsageService,
    PricingService,
    StripeService,
  ],
  exports: [
    BillingAccountService,
    InvoiceService,
    UsageService,
    PricingService,
    StripeService,
  ],
})
export class BillingModule {}




