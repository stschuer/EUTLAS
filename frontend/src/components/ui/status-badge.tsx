import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Loader2 } from "lucide-react";

/**
 * Status Badge Component
 * 
 * Visibility Principle: Clear status indication
 * Signifiers Principle: Color + icon + text for clarity
 * Feedback Principle: Animated states for in-progress
 */

type StatusType = 
  | "creating" 
  | "ready" 
  | "updating" 
  | "deleting" 
  | "failed" 
  | "degraded" 
  | "stopped"
  | "pending"
  | "success"
  | "running"
  | "scheduled";

interface StatusBadgeProps {
  status: StatusType;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<StatusType, {
  label: string;
  variant: "default" | "success" | "warning" | "destructive" | "info" | "secondary";
  isAnimated: boolean;
}> = {
  creating: { label: "Creating", variant: "warning", isAnimated: true },
  ready: { label: "Ready", variant: "success", isAnimated: false },
  updating: { label: "Updating", variant: "info", isAnimated: true },
  deleting: { label: "Deleting", variant: "destructive", isAnimated: true },
  failed: { label: "Failed", variant: "destructive", isAnimated: false },
  degraded: { label: "Degraded", variant: "warning", isAnimated: false },
  stopped: { label: "Stopped", variant: "secondary", isAnimated: false },
  pending: { label: "Pending", variant: "secondary", isAnimated: true },
  success: { label: "Completed", variant: "success", isAnimated: false },
  running: { label: "Running", variant: "info", isAnimated: true },
  scheduled: { label: "Scheduled", variant: "secondary", isAnimated: false },
};

export function StatusBadge({
  status,
  size = "md",
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "secondary", isAnimated: false };

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "gap-1.5",
        size === "sm" && "text-xs px-2 py-0.5",
        className
      )}
    >
      {showIcon && config.isAnimated && (
        <Loader2 className={cn("h-3 w-3 animate-spin", size === "sm" && "h-2.5 w-2.5")} />
      )}
      {showIcon && !config.isAnimated && (
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            config.variant === "success" && "bg-emerald-400",
            config.variant === "warning" && "bg-yellow-400",
            config.variant === "destructive" && "bg-red-400",
            config.variant === "info" && "bg-blue-400",
            config.variant === "secondary" && "bg-gray-400"
          )}
        />
      )}
      {config.label}
    </Badge>
  );
}

/**
 * Cluster-specific status badge with pulse animation for active states
 */
export function ClusterStatusBadge({
  status,
  className,
}: {
  status: StatusType;
  className?: string;
}) {
  const config = statusConfig[status];
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Animated dot for in-progress states */}
      {config?.isAnimated ? (
        <span className="relative flex h-3 w-3">
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              config.variant === "warning" && "bg-yellow-400",
              config.variant === "info" && "bg-blue-400",
              config.variant === "destructive" && "bg-red-400"
            )}
          />
          <span
            className={cn(
              "relative inline-flex rounded-full h-3 w-3",
              config.variant === "warning" && "bg-yellow-500",
              config.variant === "info" && "bg-blue-500",
              config.variant === "destructive" && "bg-red-500"
            )}
          />
        </span>
      ) : (
        <span
          className={cn(
            "h-3 w-3 rounded-full",
            config?.variant === "success" && "bg-emerald-500",
            config?.variant === "warning" && "bg-yellow-500",
            config?.variant === "destructive" && "bg-red-500",
            config?.variant === "secondary" && "bg-gray-500"
          )}
        />
      )}
      <span className="text-sm font-medium">{config?.label || status}</span>
    </div>
  );
}


