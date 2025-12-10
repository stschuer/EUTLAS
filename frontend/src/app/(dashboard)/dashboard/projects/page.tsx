"use client";

import Link from "next/link";
import { Plus, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/project-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/loading-spinner";
import { useAllProjects } from "@/hooks/use-projects";

/**
 * Projects Overview Page - Connected to real API
 */

export default function ProjectsPage() {
  const { data: projects, isLoading, error } = useAllProjects();

  if (isLoading) {
    return <PageLoading message="Loading projects..." />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Failed to load projects</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            All your projects across organizations.
          </p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Projects grid */}
      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to organize your clusters by environment."
          action={{
            label: "Create Project",
            onClick: () => (window.location.href = "/dashboard/projects/new"),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: any) => (
            <ProjectCard
              key={project.id}
              project={project}
              orgId={project.orgId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
