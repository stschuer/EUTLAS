"use client";

import Link from "next/link";
import { FolderKanban, Server, ChevronRight, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

/**
 * Project Card Component
 * 
 * Visibility: Cluster count prominently displayed
 * Affordances: Entire card is clickable
 * Signifiers: Icons indicate project nature
 * Mapping: Logical grouping of related info
 */

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    createdAt: string;
    clusterCount?: number;
  };
  orgId: string;
}

export function ProjectCard({ project, orgId }: ProjectCardProps) {
  return (
    <Link href={`/dashboard/orgs/${orgId}/projects/${project.id}`}>
      <Card className="group hover:border-primary/50 hover:bg-card/80 transition-all duration-200 cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2.5 group-hover:bg-accent/20 transition-colors">
                <FolderKanban className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  {project.name}
                </h3>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </div>

          {project.description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">{project.clusterCount ?? 0}</span>
                <span className="text-muted-foreground ml-1">Clusters</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatDate(project.createdAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Project list item for compact views
 */
export function ProjectListItem({
  project,
  orgId,
  isActive,
}: {
  project: { id: string; name: string; clusterCount?: number };
  orgId: string;
  isActive?: boolean;
}) {
  return (
    <Link
      href={`/dashboard/orgs/${orgId}/projects/${project.id}`}
      className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-accent text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        <FolderKanban className="h-4 w-4" />
        <span className="truncate">{project.name}</span>
      </div>
      {project.clusterCount !== undefined && project.clusterCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          {project.clusterCount}
        </Badge>
      )}
    </Link>
  );
}





