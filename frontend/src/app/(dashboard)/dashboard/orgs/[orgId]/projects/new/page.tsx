"use client";

import { useParams } from "next/navigation";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewProjectPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Organizations", href: "/dashboard/orgs" },
          { label: "Organization", href: `/dashboard/orgs/${orgId}` },
          { label: "New Project" },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Create Project</CardTitle>
          <CardDescription>
            Projects help organize your clusters by environment or application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateProjectForm orgId={orgId} />
        </CardContent>
      </Card>
    </div>
  );
}
