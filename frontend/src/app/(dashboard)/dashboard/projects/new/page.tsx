"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { PageLoading } from "@/components/ui/loading-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { useOrgs } from "@/hooks/use-orgs";

/**
 * Create Project Page
 * 
 * Requires an org to be selected
 */

export default function NewProjectPage() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("orgId");
  const { data: orgs, isLoading } = useOrgs();

  if (isLoading) {
    return <PageLoading message="Loading..." />;
  }

  // If no org selected, show org selector
  if (!orgId) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Create Project</h1>
          <p className="text-muted-foreground">
            First, select an organization for your new project.
          </p>
        </div>

        {!orgs || orgs.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No organizations found</CardTitle>
              <CardDescription>
                You need to create an organization before you can create a project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/orgs/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {orgs.map((org: any) => (
              <Link
                key={org.id}
                href={`/dashboard/projects/new?orgId=${org.id}`}
              >
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{org.name}</h3>
                    </div>
                    <Button variant="outline" size="sm">
                      Select
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-8">
      <CreateProjectForm orgId={orgId} />
    </div>
  );
}





