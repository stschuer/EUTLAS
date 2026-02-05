"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Building2, FolderKanban, Server, Plus, ArrowRight } from "lucide-react";
import { useOrgs } from "@/hooks/use-orgs";
import { useAllProjects } from "@/hooks/use-projects";
import { useAllClusters } from "@/hooks/use-clusters";
import { ClusterStatusBadge } from "@/components/ui/status-badge";

/**
 * Dashboard Home Page
 * Shows overview and quick actions
 */

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: orgs } = useOrgs();
  const { data: projects } = useAllProjects();
  const { data: clusters } = useAllClusters();

  const orgCount = orgs?.length || 0;
  const projectCount = projects?.length || 0;
  const clusterCount = clusters?.length || 0;
  const readyClusters = clusters?.filter((c: any) => c && c.status === "ready").length || 0;

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back{user?.name ? `, ${user.name}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your MongoDB clusters from one place.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Organizations"
          value={orgCount}
          icon={<Building2 className="h-5 w-5" />}
          href="/dashboard/orgs"
        />
        <StatsCard
          title="Projects"
          value={projectCount}
          icon={<FolderKanban className="h-5 w-5" />}
          href="/dashboard/orgs"
        />
        <StatsCard
          title="Clusters"
          value={clusterCount}
          subtitle={readyClusters > 0 ? `${readyClusters} ready` : undefined}
          icon={<Server className="h-5 w-5" />}
          href="/dashboard/orgs"
        />
      </div>

      {/* Quick Actions */}
      {orgCount === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Create your first organization to get started
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
        <Card>
          <CardHeader>
            <CardTitle>Your Organizations</CardTitle>
            <CardDescription>
              Select an organization to view projects and clusters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orgs?.slice(0, 5).map((org: any) => (
                <Link
                  key={org.id}
                  href={`/dashboard/orgs/${org.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-sm text-muted-foreground">/{org.slug}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatsCard({
  title,
  value,
  subtitle,
  icon,
  href,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold">{value}</p>
              {subtitle && (
                <p className="text-sm text-emerald-500">{subtitle}</p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickActionCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 hover:bg-card transition-all cursor-pointer h-full">
        <CardContent className="pt-6">
          <div className="text-primary mb-4">{icon}</div>
          <h3 className="font-semibold mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function GettingStartedStep({
  number,
  title,
  description,
  completed,
  action,
}: {
  number: number;
  title: string;
  description: string;
  completed?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4">
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
          completed
            ? "bg-emerald-500/20 text-emerald-500"
            : "bg-primary/20 text-primary"
        }`}
      >
        {completed ? "✓" : number}
      </div>
      <div className="flex-1">
        <h4 className={`font-medium ${completed ? "line-through text-muted-foreground" : ""}`}>
          {title}
        </h4>
        <p className="text-sm text-muted-foreground mb-2">{description}</p>
        {action}
      </div>
    </li>
  );
}
