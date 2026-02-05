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
          href="/dashboard/projects"
        />
        <StatsCard
          title="Clusters"
          value={clusterCount}
          subtitle={readyClusters > 0 ? `${readyClusters} ready` : undefined}
          icon={<Server className="h-5 w-5" />}
          href="/dashboard/clusters"
        />
      </div>

      {/* Quick Actions or Getting Started */}
      {clusterCount > 0 ? (
        // Show recent clusters if user has clusters
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Clusters</CardTitle>
              <CardDescription>Your latest MongoDB clusters</CardDescription>
            </div>
            <Link href="/dashboard/clusters">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {clusters?.filter((c: any) => c && c.id).slice(0, 3).map((cluster: any) => (
                <div
                  key={cluster.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card/50"
                >
                  <div className="flex items-center gap-3">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{cluster.name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">
                        {cluster.projectName || 'Unknown Project'}
                      </p>
                    </div>
                  </div>
                  <ClusterStatusBadge status={cluster.status || 'unknown'} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Show getting started if no clusters
        <>
          {/* Quick Actions */}
          <div className="grid md:grid-cols-3 gap-6">
            <QuickActionCard
              icon={<Building2 className="h-8 w-8" />}
              title="Create Organization"
              description="Set up a new organization for your team"
              href="/dashboard/orgs/new"
            />
            <QuickActionCard
              icon={<FolderKanban className="h-8 w-8" />}
              title="New Project"
              description="Create a project to organize your clusters"
              href="/dashboard/projects/new"
            />
            <QuickActionCard
              icon={<Server className="h-8 w-8" />}
              title="Deploy Cluster"
              description="Launch a new MongoDB cluster"
              href="/dashboard/clusters/new"
            />
          </div>

          {/* Getting Started */}
          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Follow these steps to deploy your first cluster
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                <GettingStartedStep
                  number={1}
                  title="Create an Organization"
                  description="Organizations help you manage billing and team access."
                  completed={orgCount > 0}
                  action={
                    orgCount === 0 ? (
                      <Link href="/dashboard/orgs/new">
                        <Button size="sm" variant="outline">
                          <Plus className="mr-2 h-4 w-4" />
                          Create Org
                        </Button>
                      </Link>
                    ) : undefined
                  }
                />
                <GettingStartedStep
                  number={2}
                  title="Set up a Project"
                  description="Projects group clusters for different environments (dev, prod)."
                  completed={projectCount > 0}
                  action={
                    orgCount > 0 && projectCount === 0 ? (
                      <Link href="/dashboard/projects/new">
                        <Button size="sm" variant="outline">
                          <Plus className="mr-2 h-4 w-4" />
                          Create Project
                        </Button>
                      </Link>
                    ) : undefined
                  }
                />
                <GettingStartedStep
                  number={3}
                  title="Deploy a Cluster"
                  description="Choose your plan and deploy a fully managed MongoDB cluster."
                  completed={clusterCount > 0}
                  action={
                    projectCount > 0 && clusterCount === 0 ? (
                      <Link href="/dashboard/clusters/new">
                        <Button size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Deploy Cluster
                        </Button>
                      </Link>
                    ) : undefined
                  }
                />
              </ol>
            </CardContent>
          </Card>
        </>
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
