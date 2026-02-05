"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "./button";
import { Loader2, AlertTriangle } from "lucide-react";

/**
 * Confirm Dialog Component
 * 
 * Error Tolerance Principle: Confirmation for destructive actions
 * Feedback Principle: Loading state during action
 * 
 * Supports multiple prop name variations for flexibility:
 * - onOpenChange / onClose: callback when dialog closes
 * - confirmLabel / confirmText: text for confirm button
 * - isLoading / loading: loading state
 * - variant="destructive" / isDestructive: destructive style
 */

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  confirmLabel,
  confirmText,
  cancelLabel = "Cancel",
  variant,
  isDestructive,
  onConfirm,
  isLoading,
  loading,
}: ConfirmDialogProps) {
  // Support both prop name variations
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else if (onClose && !newOpen) {
      onClose();
    }
  };
  
  const buttonLabel = confirmLabel || confirmText || "Confirm";
  const isLoadingState = isLoading || loading || false;
  const isDestructiveStyle = variant === "destructive" || isDestructive || false;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {isDestructiveStyle && (
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
          )}
          <AlertDialogTitle className={isDestructiveStyle ? "text-center" : ""}>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className={isDestructiveStyle ? "text-center" : ""}>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoadingState}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={isDestructiveStyle ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isLoadingState}
          >
            {isLoadingState && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}





