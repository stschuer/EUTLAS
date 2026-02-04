import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import React from "react";

/**
 * Empty State Component
 * 
 * Visibility Principle: Clearly shows when there's no content
 * Signifiers Principle: Provides clear action to resolve empty state
 * 
 * Supports two usage patterns:
 * 1. Simple: icon={FolderKanban} action={{ label: "Create", onClick: () => {} }}
 * 2. Custom: icon={<CustomIcon />} action={<CustomButton />}
 */

interface EmptyStateProps {
  icon: LucideIcon | React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  } | React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  // Determine if icon is a component reference or a React element
  const isIconComponent = typeof icon === 'function';
  const IconComponent = isIconComponent ? (icon as LucideIcon) : null;
  
  // Determine if action is an object or a React element
  const isActionObject = action && typeof action === 'object' && 'label' in action && 'onClick' in action;
  
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-12 text-center",
        className
      )}
    >
      {/* Icon with subtle background */}
      <div className="mb-4 rounded-full bg-primary/10 p-4">
        {IconComponent ? (
          <IconComponent className="h-8 w-8 text-primary" aria-hidden="true" />
        ) : (
          icon
        )}
      </div>
      
      {/* Title - prominent */}
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      
      {/* Description - supportive text */}
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      
      {/* Action - clear affordance */}
      {action && (
        isActionObject ? (
          <Button onClick={(action as { label: string; onClick: () => void }).onClick}>
            {(action as { label: string; onClick: () => void }).label}
          </Button>
        ) : (
          action
        )
      )}
    </div>
  );
}





