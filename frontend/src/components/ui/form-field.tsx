"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";
import { Input } from "./input";
import { AlertCircle, HelpCircle } from "lucide-react";
import { SimpleTooltip } from "./tooltip";

/**
 * Form Field Component
 * 
 * Signifiers Principle: Clear labels and help text
 * Feedback Principle: Error states with helpful messages
 * Constraints Principle: Validation feedback
 */

interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  register?: any; // react-hook-form register
}

export function FormField({
  label,
  name,
  type = "text",
  placeholder,
  error,
  helpText,
  required = false,
  disabled = false,
  className,
  inputClassName,
  register,
}: FormFieldProps) {
  const hasError = !!error;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label with optional required indicator and help tooltip */}
      <div className="flex items-center gap-2">
        <Label
          htmlFor={name}
          className={cn(hasError && "text-destructive")}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {helpText && (
          <SimpleTooltip content={helpText}>
            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
          </SimpleTooltip>
        )}
      </div>

      {/* Input with error styling */}
      <div className="relative">
        <Input
          id={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            hasError && "border-destructive focus-visible:ring-destructive",
            inputClassName
          )}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${name}-error` : undefined}
          {...(register ? register(name) : { name })}
        />
        {hasError && (
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <p
          id={`${name}-error`}
          className="text-sm text-destructive flex items-center gap-1"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Form Section Component for grouping related fields
 */
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}




