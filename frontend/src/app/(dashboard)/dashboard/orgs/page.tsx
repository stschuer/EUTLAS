"use client";

import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgCard } from "@/components/orgs/org-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/loading-spinner";
import { useOrgs } from "@/hooks/use-orgs";

/**
 * Organizations List Page - Connected to real API
 */

export default function OrgsPage() {
  const { data: orgs, isLoading } = useOrgs();

  if (isLoading) {
    return <PageLoading message="Loading organizations..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header with action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">
            Manage your organizations and team access.
          </p>
        </div>
        <Link href="/dashboard/orgs/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Organization
          </Button>
        </Link>
      </div>

      {/* Content */}
      {!orgs || orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          description="Create your first organization to get started with managing your MongoDB clusters."
          action={{
            label: "Create Organization",
            onClick: () => (window.location.href = "/dashboard/orgs/new"),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org: any) => (
            <OrgCard key={org.id} org={org} userRole={org.userRole} />
          ))}
        </div>
      )}
    </div>
  );
}
