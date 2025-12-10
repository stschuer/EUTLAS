"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Plan Selector Component
 * 
 * Visibility: All options visible at once
 * Affordances: Clear selection states
 * Signifiers: Icons, prices, and feature lists
 * Mapping: Visual hierarchy shows recommended plan
 */

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  ram: string;
  storage: string;
  recommended?: boolean;
}

const plans: Plan[] = [
  {
    id: "DEV",
    name: "Development",
    description: "Perfect for development and testing",
    price: 9,
    ram: "512MB",
    storage: "5GB",
  },
  {
    id: "SMALL",
    name: "Small Production",
    description: "Small production workloads",
    price: 29,
    ram: "1GB",
    storage: "20GB",
  },
  {
    id: "MEDIUM",
    name: "Medium Production",
    description: "Growing applications",
    price: 59,
    ram: "2GB",
    storage: "50GB",
    recommended: true,
  },
  {
    id: "LARGE",
    name: "Large Production",
    description: "High-traffic applications",
    price: 119,
    ram: "4GB",
    storage: "100GB",
  },
  {
    id: "XLARGE",
    name: "Enterprise",
    description: "Enterprise-grade performance",
    price: 229,
    ram: "8GB",
    storage: "200GB",
  },
];

interface PlanSelectorProps {
  selectedPlan: string;
  onPlanChange: (planId: string) => void;
  disabled?: boolean;
  currentPlan?: string; // For resize - shows current plan
}

export function PlanSelector({
  selectedPlan,
  onPlanChange,
  disabled = false,
  currentPlan,
}: PlanSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Signifier: Help text explaining the selection */}
      <p className="text-sm text-muted-foreground">
        Select a plan that fits your workload. You can resize later.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isCurrent = currentPlan === plan.id;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => !disabled && onPlanChange(plan.id)}
              disabled={disabled}
              className={cn(
                "relative flex flex-col rounded-lg border p-4 text-left transition-all duration-200",
                // Affordances: Clear visual difference for interactive states
                !disabled && "hover:border-primary/50 hover:bg-primary/5 cursor-pointer",
                disabled && "opacity-50 cursor-not-allowed",
                // Feedback: Selected state clearly visible
                isSelected && "border-primary bg-primary/10 ring-2 ring-primary",
                !isSelected && "border-border bg-card",
                // Signifier: Recommended plan highlighted
                plan.recommended && !isSelected && "border-primary/30"
              )}
              aria-pressed={isSelected}
            >
              {/* Recommended badge - Signifier */}
              {plan.recommended && (
                <div className="absolute -top-2 left-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    <Zap className="h-3 w-3" />
                    Recommended
                  </span>
                </div>
              )}

              {/* Current plan indicator */}
              {isCurrent && (
                <div className="absolute -top-2 right-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    Current
                  </span>
                </div>
              )}

              {/* Selected checkmark - Visual feedback */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
              )}

              {/* Plan name and description */}
              <div className={cn("mb-3", plan.recommended && "mt-2")}>
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              {/* Price - Prominent */}
              <div className="mb-3">
                <span className="text-2xl font-bold">€{plan.price}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>

              {/* Specs - Clear information */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RAM</span>
                  <span className="font-medium">{plan.ram}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Storage</span>
                  <span className="font-medium">{plan.storage}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


