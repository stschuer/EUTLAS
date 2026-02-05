'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { PitrPanel } from '@/components/pitr/pitr-panel';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function PitrPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const clusterId = params.clusterId as string;
  const projectId = searchParams.get('projectId') || '';
  const clusterName = searchParams.get('clusterName') || 'Cluster';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/clusters/${clusterId}?projectId=${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Point-in-Time Recovery"
          description={`Configure and manage PITR for ${clusterName}`}
        />
      </div>
      <PitrPanel 
        projectId={projectId}
        clusterId={clusterId}
        clusterName={clusterName}
      />
    </div>
  );
}





