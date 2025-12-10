"use client";

import Link from "next/link";
import { Building2, Users, FolderKanban, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Organization Card Component
 * 
 * Visibility: Key metrics visible at a glance
 * Affordances: Entire card is clickable
 * Signifiers: Icons for different metrics
 * Feedback: Hover state shows interactivity
 */

interface OrgCardProps {
  org: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    projectCount?: number;
    memberCount?: number;
  };
  userRole?: string;
}

export function OrgCard({ org, userRole }: OrgCardProps) {
  return (
    <Link href={`/dashboard/orgs/${org.id}`}>
      <Card className="group hover:border-primary/50 hover:bg-card/80 transition-all duration-200 cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            {/* Org info */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/20 transition-colors">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  {org.name}
                </h3>
                <p className="text-sm text-muted-foreground">/{org.slug}</p>
              </div>
            </div>

            {/* Role badge and arrow */}
            <div className="flex items-center gap-2">
              {userRole && (
                <Badge variant="outline" className="text-xs">
                  {userRole}
                </Badge>
              )}
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>

          {/* Stats - quick glance metrics */}
          <div className="flex gap-4 mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FolderKanban className="h-4 w-4" />
              <span>{org.projectCount ?? 0} Projects</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{org.memberCount ?? 1} Members</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Compact org selector for navigation
 */
export function OrgSelector({
  orgs,
  selectedOrgId,
  onSelect,
}: {
  orgs: Array<{ id: string; name: string }>;
  selectedOrgId?: string;
  onSelect: (orgId: string) => void;
}) {
  return (
    <div className="space-y-1">
      {orgs.map((org) => (
        <button
          key={org.id}
          onClick={() => onSelect(org.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors",
            selectedOrgId === org.id
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="h-4 w-4" />
          <span className="truncate">{org.name}</span>
        </button>
      ))}
    </div>
  );
}


