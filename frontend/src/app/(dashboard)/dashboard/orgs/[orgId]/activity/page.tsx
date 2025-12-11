'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { ActivityFeed } from '@/components/activity/activity-feed';
import { PageHeader } from '@/components/layout/page-header';

export default function ActivityFeedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const orgId = params.orgId as string;
  const projectId = searchParams.get('projectId') || undefined;
  const clusterId = searchParams.get('clusterId') || undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Feed"
        description="Real-time view of all activities across your organization"
      />
      <ActivityFeed 
        orgId={orgId}
        projectId={projectId}
        clusterId={clusterId}
      />
    </div>
  );
}



