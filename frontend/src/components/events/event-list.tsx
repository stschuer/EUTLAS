"use client";

import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Server,
  Archive,
  RotateCcw,
} from "lucide-react";

/**
 * Event List Component
 * 
 * Visibility: Timeline shows chronological events
 * Signifiers: Icons and colors indicate event type
 * Feedback: Clear success/error indicators
 */

interface Event {
  id: string;
  type: string;
  severity: "info" | "warning" | "error";
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface EventListProps {
  events: Event[];
  className?: string;
}

const eventIcons: Record<string, React.ElementType> = {
  CLUSTER_CREATED: Server,
  CLUSTER_READY: CheckCircle2,
  CLUSTER_UPDATED: Info,
  CLUSTER_RESIZED: Server,
  CLUSTER_DELETED: XCircle,
  CLUSTER_FAILED: XCircle,
  CLUSTER_DEGRADED: AlertTriangle,
  BACKUP_STARTED: Archive,
  BACKUP_COMPLETED: CheckCircle2,
  BACKUP_FAILED: XCircle,
  RESTORE_STARTED: RotateCcw,
  RESTORE_COMPLETED: CheckCircle2,
  RESTORE_FAILED: XCircle,
};

const severityStyles = {
  info: {
    icon: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  warning: {
    icon: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  error: {
    icon: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
};

export function EventList({ events, className }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No events yet
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {events.map((event, index) => {
        const Icon = eventIcons[event.type] || Info;
        const styles = severityStyles[event.severity];

        return (
          <div
            key={event.id}
            className={cn(
              "relative pl-8 pb-4",
              index !== events.length - 1 && "border-l border-border ml-3"
            )}
          >
            {/* Icon on timeline */}
            <div
              className={cn(
                "absolute left-0 -translate-x-1/2 rounded-full p-1.5",
                styles.bg
              )}
            >
              <Icon className={cn("h-4 w-4", styles.icon)} />
            </div>

            {/* Event content */}
            <div className="ml-4">
              <p className="font-medium">{event.message}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact event item for sidebars
 */
export function EventItem({ event }: { event: Event }) {
  const Icon = eventIcons[event.type] || Info;
  const styles = severityStyles[event.severity];

  return (
    <div className="flex items-start gap-3 py-2">
      <div className={cn("rounded-full p-1", styles.bg)}>
        <Icon className={cn("h-3 w-3", styles.icon)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{event.message}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(event.createdAt)}
        </p>
      </div>
    </div>
  );
}





