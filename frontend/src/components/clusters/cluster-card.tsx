"use client";

import { useState } from "react";
import Link from "next/link";
import { Server, MoreVertical, ExternalLink, Trash2, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClusterStatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Cluster Card Component
 * 
 * Visibility: Status prominent, key info visible
 * Affordances: Clear clickable areas
 * Signifiers: Icons + labels for actions
 * Mapping: Related actions grouped in dropdown
 */

interface ClusterCardProps {
  cluster: {
    id: string;
    name: string;
    status: string;
    plan: string;
    mongoVersion: string;
    projectId: string;
    createdAt: string;
  };
  projectId: string;
  onDelete?: (clusterId: string) => void;
  onResize?: (clusterId: string) => void;
}

const planLabels: Record<string, string> = {
  DEV: "Development",
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  XLARGE: "Enterprise",
};

export function ClusterCard({
  cluster,
  projectId,
  onDelete,
  onResize,
}: ClusterCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const canModify = cluster.status === "ready" || cluster.status === "degraded";

  return (
    <Card className="group hover:border-primary/50 transition-all duration-200">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          {/* Icon with status-colored background */}
          <div
            className={cn(
              "rounded-lg p-2 transition-colors",
              cluster.status === "ready" && "bg-emerald-500/10",
              cluster.status === "creating" && "bg-yellow-500/10",
              cluster.status === "updating" && "bg-blue-500/10",
              cluster.status === "failed" && "bg-red-500/10",
              cluster.status === "deleting" && "bg-red-500/10",
              cluster.status === "degraded" && "bg-orange-500/10",
              cluster.status === "stopped" && "bg-gray-500/10"
            )}
          >
            <Server
              className={cn(
                "h-5 w-5",
                cluster.status === "ready" && "text-emerald-500",
                cluster.status === "creating" && "text-yellow-500",
                cluster.status === "updating" && "text-blue-500",
                cluster.status === "failed" && "text-red-500",
                cluster.status === "deleting" && "text-red-500",
                cluster.status === "degraded" && "text-orange-500",
                cluster.status === "stopped" && "text-gray-500"
              )}
            />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">
              {cluster.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              MongoDB {cluster.mongoVersion}
            </p>
          </div>
        </div>

        {/* Actions dropdown - Mapping principle: grouped actions */}
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Cluster actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/clusters/${cluster.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            {/* Constraints: Disabled when not modifiable */}
            <DropdownMenuItem
              disabled={!canModify}
              onClick={() => onResize?.(cluster.id)}
            >
              <Scale className="mr-2 h-4 w-4" />
              Resize Cluster
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Destructive action visually distinct */}
            <DropdownMenuItem
              disabled={!canModify}
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(cluster.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Cluster
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        {/* Status and Plan - high visibility */}
        <div className="flex items-center justify-between mb-4">
          <ClusterStatusBadge status={cluster.status as any} />
          <Badge variant="outline">{planLabels[cluster.plan] || cluster.plan}</Badge>
        </div>

        {/* Quick action - prominent when cluster is ready */}
        {cluster.status === "ready" && (
          <Link href={`/dashboard/clusters/${cluster.id}/credentials`}>
            <Button variant="outline" size="sm" className="w-full">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Connection String
            </Button>
          </Link>
        )}

        {/* Feedback for non-ready states */}
        {cluster.status === "creating" && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Your cluster is being provisioned...
          </p>
        )}
        {cluster.status === "failed" && (
          <p className="text-sm text-destructive text-center py-2">
            Cluster provisioning failed. Contact support.
          </p>
        )}
      </CardContent>
    </Card>
  );
}


