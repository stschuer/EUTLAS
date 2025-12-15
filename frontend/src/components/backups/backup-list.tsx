"use client";

import { Archive, Clock, CheckCircle2, XCircle, Loader2, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime, formatBytes } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Backup List Component
 * 
 * Visibility: Clear backup status and timing
 * Signifiers: Icons and colors for status
 * Feedback: Loading states for running backups
 */

interface Backup {
  id: string;
  type: "automatic" | "manual";
  status: "scheduled" | "running" | "success" | "failed";
  sizeBytes?: number;
  createdAt: string;
  completedAt?: string;
}

interface BackupListProps {
  backups: Backup[];
  clusterId: string;
  onCreateBackup?: () => void;
  isCreating?: boolean;
}

export function BackupList({
  backups,
  clusterId,
  onCreateBackup,
  isCreating,
}: BackupListProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-primary" />
            Backups
          </CardTitle>
          <CardDescription>
            Automatic daily backups are included. You can also create manual backups.
          </CardDescription>
        </div>
        {onCreateBackup && (
          <Button onClick={onCreateBackup} disabled={isCreating} size="sm">
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            Create Backup
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {backups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No backups yet</p>
            <p className="text-sm">Automatic backups will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map((backup) => (
              <BackupItem key={backup.id} backup={backup} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackupItem({ backup }: { backup: Backup }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div className="rounded-full p-2 bg-muted">
          {backup.status === "running" && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {backup.status === "success" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          {backup.status === "failed" && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          {backup.status === "scheduled" && (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium capitalize">
              {backup.type} Backup
            </span>
            <StatusBadge status={backup.status} size="sm" showIcon={false} />
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>{formatDateTime(backup.createdAt)}</span>
            {backup.sizeBytes && (
              <>
                <span>•</span>
                <span>{formatBytes(backup.sizeBytes)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions - only for completed backups */}
      {backup.status === "success" && (
        <Button variant="ghost" size="sm" disabled>
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}





