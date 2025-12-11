import { cn } from "@/lib/utils";

/**
 * Loading Spinner Component
 * 
 * Feedback Principle: Provides visual indication that something is loading
 */

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function LoadingSpinner({
  size = "md",
  className,
  label = "Loading...",
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-3",
  };

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-primary/30 border-t-primary",
          sizeClasses[size]
        )}
        role="status"
        aria-label={label}
      />
      {label && size !== "sm" && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

/**
 * Full page loading state
 */
export function PageLoading({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <LoadingSpinner size="lg" label={message} />
    </div>
  );
}

/**
 * Inline loading indicator
 */
export function InlineLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
      <LoadingSpinner size="sm" label="" />
      <span className="text-sm">Loading...</span>
    </div>
  );
}



