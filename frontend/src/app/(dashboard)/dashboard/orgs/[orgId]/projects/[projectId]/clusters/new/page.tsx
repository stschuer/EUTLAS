"use client";

import { useParams, useRouter } from "next/navigation";
import { CreateClusterWizard } from "@/components/clusters/create-cluster-wizard";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export default function NewClusterPage() {
  const params = useParams();
  const router = useRouter();
  
  const orgId = params.orgId as string;
  const projectId = params.projectId as string;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Organizations", href: "/dashboard/orgs" },
          { label: "Organization", href: `/dashboard/orgs/${orgId}` },
          { label: "Project", href: `/dashboard/orgs/${orgId}/projects/${projectId}` },
          { label: "New Cluster" },
        ]}
      />
      
      <div>
        <h1 className="text-3xl font-bold">Create Cluster</h1>
        <p className="text-muted-foreground">Deploy a new MongoDB cluster</p>
      </div>

      <CreateClusterWizard projectId={projectId} orgId={orgId} />
    </div>
  );
}
