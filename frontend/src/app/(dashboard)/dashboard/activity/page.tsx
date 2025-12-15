'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActivityFeed } from '@/components/activity/activity-feed';
import { PageHeader } from '@/components/layout/page-header';
import { useOrgs } from '@/hooks/use-orgs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLoading } from '@/components/ui/loading-spinner';

export default function ActivityPage() {
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
          title="Activity Feed"
          description="Real-time view of all activities across your organization"
        />
        <div className="text-center py-12 text-muted-foreground">
          <p>Create an organization to start tracking activity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Activity Feed"
          description="Real-time view of all activities across your organization"
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
        <ActivityFeed orgId={selectedOrgId} />
      )}
    </div>
  );
}





