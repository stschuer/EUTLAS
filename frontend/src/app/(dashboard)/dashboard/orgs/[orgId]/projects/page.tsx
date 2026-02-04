'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectCard } from '@/components/projects/project-card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/layout/page-header';
import { useProjects } from '@/hooks/use-projects';

/**
 * Organization Projects Page - Lists all projects in an organization
 */

export default function OrgProjectsPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const { data: projects, isLoading, error } = useProjects(orgId);

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
      <PageHeader
        title="Projects"
        description="Organize your clusters into projects for better management"
        actions={
          <Link href={`/dashboard/projects/new?orgId=${orgId}`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </Link>
        }
      />

      {/* Projects grid */}
      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to organize your clusters by environment or team."
          action={{
            label: "Create Project",
            onClick: () => (window.location.href = `/dashboard/projects/new?orgId=${orgId}`),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: any) => (
            <ProjectCard
              key={project.id}
              project={project}
              orgId={orgId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
