'use client';

import { useEffect, useState } from 'react';
import { BillingDashboard } from '@/components/billing/billing-dashboard';
import { PageHeader } from '@/components/layout/page-header';
import { useOrgs } from '@/hooks/use-orgs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading-spinner';

export default function BillingPage() {
  const { data: orgsData, isLoading: orgsLoading } = useOrgs();
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  
  const orgs = (orgsData as any)?.data || [];
  
  useEffect(() => {
    // Auto-select first org
    if (orgs.length > 0 && !selectedOrgId) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

  if (orgsLoading) {
    return <PageLoading message="Loading organizations..." />;
  }

  if (orgs.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Billing & Usage"
          description="Manage your billing account and view usage"
        />
        <div className="text-center py-12 text-muted-foreground">
          <p>Create an organization to start using billing features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Billing & Usage"
          description="Manage your billing account and view usage"
        />
        {orgs.length > 1 && (
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((org: any) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      
      {selectedOrgId && (
        <BillingDashboard orgId={selectedOrgId} />
      )}
    </div>
  );
}




