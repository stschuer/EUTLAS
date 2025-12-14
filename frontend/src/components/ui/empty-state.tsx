import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Empty State Component
 * 
 * Visibility Principle: Clearly shows when there's no content
 * Signifiers Principle: Provides clear action to resolve empty state
 */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-12 text-center",
        className
      )}
    >
      {/* Icon with subtle background */}
      <div className="mb-4 rounded-full bg-primary/10 p-4">
        <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      
      {/* Title - prominent */}
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      
      {/* Description - supportive text */}
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      
      {/* Action - clear affordance */}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}




