"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Server, ChevronRight, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlanSelector } from "./plan-selector";
import { useCreateCluster } from "@/hooks/use-clusters";
import { cn } from "@/lib/utils";

/**
 * Create Cluster Wizard - Connected to real API
 */

const createClusterSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(30, "Name must be at most 30 characters")
    .regex(
      /^[a-z][a-z0-9-]*[a-z0-9]$/,
      "Name must start with a letter, contain only lowercase letters, numbers, and hyphens"
    ),
  plan: z.enum(["DEV", "SMALL", "MEDIUM", "LARGE", "XLARGE"]),
});

type CreateClusterForm = z.infer<typeof createClusterSchema>;

interface CreateClusterWizardProps {
  projectId: string;
  orgId?: string;
  onSuccess?: () => void;
}

export function CreateClusterWizard({
  projectId,
  orgId,
  onSuccess,
}: CreateClusterWizardProps) {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const createCluster = useCreateCluster(projectId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    trigger,
  } = useForm<CreateClusterForm>({
    resolver: zodResolver(createClusterSchema),
    defaultValues: {
      name: "",
      plan: "MEDIUM",
    },
    mode: "onChange",
  });

  const selectedPlan = watch("plan");
  const clusterName = watch("name");

  const canProceed = async () => {
    if (step === 1) {
      return await trigger("name");
    }
    if (step === 2) {
      return await trigger("plan");
    }
    return true;
  };

  const nextStep = async () => {
    const valid = await canProceed();
    if (valid && step < 3) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const onSubmit = async (data: CreateClusterForm) => {
    try {
      await createCluster.mutateAsync(data);
      onSuccess?.();
      // Navigate back to project page if orgId is available, otherwise to orgs list
      if (orgId) {
        router.push(`/dashboard/orgs/${orgId}/projects/${projectId}`);
      } else {
        router.push(`/dashboard/orgs`);
      }
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const isSubmitting = createCluster.isPending;

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-primary/10 p-2">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>Create New Cluster</CardTitle>
            <CardDescription>
              Deploy a managed MongoDB cluster in minutes
            </CardDescription>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  s === step && "bg-primary text-primary-foreground",
                  s < step && "bg-primary/20 text-primary",
                  s > step && "bg-muted text-muted-foreground"
                )}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 w-8 transition-colors",
                    s < step ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-6">
          {/* Step 1: Name */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-lg font-semibold">Name your cluster</h3>
              <div className="space-y-2">
                <Label htmlFor="name">Cluster Name</Label>
                <Input
                  id="name"
                  placeholder="my-cluster-01"
                  {...register("name")}
                  className={cn(errors.name && "border-destructive")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Use lowercase letters, numbers, and hyphens only.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Plan */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-lg font-semibold">Choose your plan</h3>
              <PlanSelector
                selectedPlan={selectedPlan}
                onPlanChange={(plan) => setValue("plan", plan as any)}
              />
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-lg font-semibold">Review & Create</h3>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cluster Name</span>
                  <span className="font-medium">{clusterName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{selectedPlan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MongoDB Version</span>
                  <span className="font-medium">7.0 (Latest Stable)</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Your cluster will be ready in a few minutes after creation.
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={step === 1 || isSubmitting}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={nextStep}>
              Continue
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Cluster
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
