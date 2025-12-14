'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { MaintenanceWindows } from '@/components/maintenance/maintenance-windows';
import { CreateMaintenanceForm } from '@/components/maintenance/create-maintenance-form';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function MaintenancePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [showCreateForm, setShowCreateForm] = useState(false);

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
          title="Maintenance Windows"
          description={`Schedule maintenance operations for ${clusterName}`}
        />
      </div>

      {showCreateForm ? (
        <CreateMaintenanceForm
          projectId={projectId}
          clusterId={clusterId}
          onSuccess={() => setShowCreateForm(false)}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : (
        <MaintenanceWindows
          projectId={projectId}
          clusterId={clusterId}
          onCreateClick={() => setShowCreateForm(true)}
        />
      )}
    </div>
  );
}




