'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/lib/api-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  CreditCard,
  Receipt,
  BarChart3,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Building2,
  Mail,
  MapPin,
  FileText,
  TrendingUp,
  Wallet,
} from 'lucide-react';

interface BillingAccount {
  id: string;
  companyName?: string;
  billingEmail: string;
  billingName?: string;
  address?: {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  vatId?: string;
  currency: string;
  taxPercent: number;
  paymentMethodType: 'card' | 'sepa_debit' | 'invoice' | 'none';
  paymentMethod?: {
    type: string;
    last4?: string;
    brand?: string;
  };
  creditBalanceCents: number;
  delinquent: boolean;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'open' | 'paid' | 'void';
  currency: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  dueDate: string;
  paidAt?: string;
  lineItems: {
    description: string;
    quantity: number;
    unit: string;
    totalCents: number;
  }[];
}

interface InvoiceStats {
  totalPaid: number;
  totalOpen: number;
  totalOverdue: number;
  invoiceCount: number;
  totalPaidFormatted: string;
  totalOpenFormatted: string;
  totalOverdueFormatted: string;
}

interface UsageSummary {
  totalCents: number;
  totalFormatted: string;
  byCluster: {
    clusterId: string;
    clusterName: string;
    totalCents: number;
  }[];
  byUsageType: {
    usageType: string;
    quantity: number;
    totalCents: number;
  }[];
}

const formatCurrency = (cents: number, currency = 'EUR') => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(cents / 100);
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  open: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  paid: 'bg-green-500/10 text-green-600 border-green-500/20',
  void: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const usageTypeLabels: Record<string, string> = {
  cluster_hours: 'Cluster Hours',
  storage_gb_hours: 'Storage',
  data_transfer_gb: 'Data Transfer',
  backup_storage_gb: 'Backup Storage',
};

export default function BillingPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [vatId, setVatId] = useState('');

  // Fetch billing account
  const { data: account, isLoading: loadingAccount } = useQuery({
    queryKey: ['billing-account', orgId],
    queryFn: async () => {
      const res = await apiClient.get(`/orgs/${orgId}/billing/account`);
      return res.data.data as BillingAccount | null;
    },
  });

  // Fetch invoice stats
  const { data: stats } = useQuery({
    queryKey: ['invoice-stats', orgId],
    queryFn: async () => {
      const res = await apiClient.get(`/orgs/${orgId}/billing/invoices/stats`);
      return res.data.data as InvoiceStats;
    },
    enabled: !!account,
  });

  // Fetch invoices
  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices', orgId],
    queryFn: async () => {
      const res = await apiClient.get(`/orgs/${orgId}/billing/invoices`);
      return res.data.data as Invoice[];
    },
    enabled: !!account,
  });

  // Fetch usage summary
  const { data: usage } = useQuery({
    queryKey: ['usage-summary', orgId],
    queryFn: async () => {
      const res = await apiClient.get(`/orgs/${orgId}/billing/usage/summary`);
      return res.data.data as UsageSummary;
    },
    enabled: !!account,
  });

  // Create billing account mutation
  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/orgs/${orgId}/billing/account`, {
        billingEmail,
        companyName: companyName || undefined,
        vatId: vatId || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-account', orgId] });
      setShowSetupDialog(false);
      toast({ title: 'Billing account created' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.message || 'Failed to create billing account', variant: 'destructive' });
    },
  });

  // Mark invoice paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiClient.post(`/orgs/${orgId}/billing/invoices/${invoiceId}/paid`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', orgId] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats', orgId] });
      toast({ title: 'Invoice marked as paid' });
    },
  });

  if (loadingAccount) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  // No billing account - show setup
  if (!account) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Billing"
          description="Manage your billing and invoices"
        />
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={<CreditCard className="h-12 w-12" />}
              title="Set up billing"
              description="Create a billing account to start tracking usage and receive invoices."
              action={
                <Button onClick={() => setShowSetupDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Set Up Billing
                </Button>
              }
            />
          </CardContent>
        </Card>

        {/* Setup Dialog */}
        <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set Up Billing</DialogTitle>
              <DialogDescription>
                Enter your billing information to receive invoices.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAccountMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Billing Email *</Label>
                <Input
                  type="email"
                  placeholder="billing@company.com"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Company Name (optional)</Label>
                <Input
                  placeholder="Acme Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>VAT ID (optional)</Label>
                <Input
                  placeholder="DE123456789"
                  value={vatId}
                  onChange={(e) => setVatId(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowSetupDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!billingEmail || createAccountMutation.isPending}>
                  {createAccountMutation.isPending ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Manage your billing and invoices"
      />

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{formatCurrency(account.creditBalanceCents)}</div>
                <div className="text-sm text-muted-foreground">Credit Balance</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{usage?.totalFormatted || '€0,00'}</div>
                <div className="text-sm text-muted-foreground">Current Period</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats?.totalOverdue ? 'border-red-500/50' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${stats?.totalOverdue ? 'text-red-500' : 'text-muted-foreground'}`} />
              <div>
                <div className="text-2xl font-bold">{stats?.totalOverdueFormatted || '€0,00'}</div>
                <div className="text-sm text-muted-foreground">Overdue</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{stats?.invoiceCount || 0}</div>
                <div className="text-sm text-muted-foreground">Total Invoices</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          {loadingInvoices ? (
            <div className="flex justify-center p-8"><LoadingSpinner /></div>
          ) : invoices && invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <Card key={invoice.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium">{invoice.invoiceNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(invoice.billingPeriodStart).toLocaleDateString()} - {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge className={statusColors[invoice.status]}>
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </Badge>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatCurrency(invoice.totalCents, invoice.currency)}</div>
                          <div className="text-xs text-muted-foreground">
                            Due {new Date(invoice.dueDate).toLocaleDateString()}
                          </div>
                        </div>
                        {invoice.status === 'open' && (
                          <Button size="sm" onClick={() => markPaidMutation.mutate(invoice.id)}>
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Receipt className="h-12 w-12" />}
              title="No invoices yet"
              description="Your invoices will appear here once generated."
            />
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          {usage ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {/* By Usage Type */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">By Usage Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {usage.byUsageType.length > 0 ? (
                      <div className="space-y-3">
                        {usage.byUsageType.map((item) => (
                          <div key={item.usageType} className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{usageTypeLabels[item.usageType] || item.usageType}</div>
                              <div className="text-sm text-muted-foreground">{item.quantity.toLocaleString()} units</div>
                            </div>
                            <div className="font-medium">{formatCurrency(item.totalCents)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">No usage recorded</div>
                    )}
                  </CardContent>
                </Card>

                {/* By Cluster */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">By Cluster</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {usage.byCluster.length > 0 ? (
                      <div className="space-y-3">
                        {usage.byCluster.map((item) => (
                          <div key={item.clusterId} className="flex items-center justify-between">
                            <div className="font-medium">{item.clusterName}</div>
                            <div className="font-medium">{formatCurrency(item.totalCents)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">No cluster usage</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="flex justify-center p-8"><LoadingSpinner /></div>
          )}
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Billing Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Billing Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {account.companyName && (
                  <div>
                    <div className="text-sm text-muted-foreground">Company</div>
                    <div className="font-medium">{account.companyName}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="font-medium">{account.billingEmail}</div>
                </div>
                {account.vatId && (
                  <div>
                    <div className="text-sm text-muted-foreground">VAT ID</div>
                    <div className="font-medium">{account.vatId}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Tax Rate</div>
                  <div className="font-medium">{account.taxPercent}%</div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent>
                {account.paymentMethodType !== 'none' && account.paymentMethod ? (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium capitalize">{account.paymentMethod.brand || account.paymentMethodType}</div>
                      <div className="text-sm text-muted-foreground">
                        •••• {account.paymentMethod.last4}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground mb-2">No payment method</div>
                    <Button variant="outline" size="sm" disabled>
                      <Plus className="h-4 w-4 mr-1" /> Add Payment Method
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">Coming soon with Stripe integration</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


