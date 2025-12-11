'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { orgsApi } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function AuditRedirectPage() {
  const router = useRouter();

  const { data: orgs, isLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      const res = await orgsApi.list();
      return res.success ? res.data : [];
    },
  });

  useEffect(() => {
    if (!isLoading && orgs && orgs.length > 0) {
      router.replace(`/dashboard/orgs/${orgs[0].id}/audit`);
    }
  }, [isLoading, orgs, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!orgs || orgs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No organizations found. Create one first.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner />
    </div>
  );
}



