"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Users,
  FolderKanban,
  Activity,
  Bell,
  Key,
  CreditCard,
  Shield,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { orgsApi } from "@/lib/api-client";

interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

const orgSections = [
  { href: "team", label: "Team Members", icon: Users, description: "Manage organization members and roles" },
  { href: "projects", label: "Projects", icon: FolderKanban, description: "View and manage projects" },
  { href: "activity", label: "Activity", icon: Activity, description: "View organization activity feed" },
  { href: "alerts", label: "Alerts", icon: Bell, description: "Configure alerts and notifications" },
  { href: "notifications", label: "Notifications", icon: Bell, description: "Notification channels" },
  { href: "api-keys", label: "API Keys", icon: Key, description: "Manage API keys" },
  { href: "billing", label: "Billing", icon: CreditCard, description: "View billing and usage" },
  { href: "audit", label: "Audit Log", icon: Shield, description: "View audit logs" },
  { href: "dashboards", label: "Dashboards", icon: LayoutDashboard, description: "Custom dashboards" },
];

export default function OrganizationPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const response = await orgsApi.get(orgId);

        if (response.success && response.data) {
          setOrg(response.data as Organization);
        } else if (response.error?.code === "NOT_FOUND") {
          setError("Organization not found");
        } else {
          setError("Failed to load organization");
        }
      } catch (err) {
        setError("Failed to load organization");
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Building2 className="h-16 w-16 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-semibold">{error}</h2>
        <Button onClick={() => router.push("/dashboard/orgs")}>
          Back to Organizations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{org?.name}</h1>
            <p className="text-muted-foreground">/{org?.slug}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/orgs/${orgId}/team`}>
            <Settings className="h-4 w-4 mr-2" />
            Manage
          </Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {org?.createdAt ? new Date(org.createdAt).toLocaleDateString() : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Slug
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{org?.slug}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {org?.updatedAt ? new Date(org.updatedAt).toLocaleDateString() : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {orgSections.map((section) => (
          <Link key={section.href} href={`/dashboard/orgs/${orgId}/${section.href}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{section.label}</CardTitle>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}



