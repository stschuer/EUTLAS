"use client";

import { useSearchParams } from "next/navigation";
import { CreateClusterWizard } from "@/components/clusters/create-cluster-wizard";
import { PageLoading } from "@/components/ui/loading-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useAllProjects } from "@/hooks/use-projects";

/**
 * Create Cluster Page
 * 
 * Requires a project to be selected
 */

export default function NewClusterPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const { data: projects, isLoading } = useAllProjects();

  if (isLoading) {
    return <PageLoading message="Loading..." />;
  }

  // If no project selected, show project selector
  if (!projectId) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Create Cluster</h1>
          <p className="text-muted-foreground">
            First, select a project for your new cluster.
          </p>
        </div>

        {!projects || projects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No projects found</CardTitle>
              <CardDescription>
                You need to create a project before you can deploy a cluster.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/projects/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {projects.map((project: any) => (
              <Link
                key={project.id}
                href={`/dashboard/clusters/new?projectId=${project.id}`}
              >
                <Card className="hover:border-primary/50 cursor-pointer transition-colors">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="rounded-lg bg-accent/10 p-2">
                      <FolderKanban className="h-5 w-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{project.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {project.orgName}
                      </p>
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
      <CreateClusterWizard projectId={projectId} />
    </div>
  );
}
