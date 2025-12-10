"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Building2 } from "lucide-react";

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
import { useToast } from "@/components/ui/use-toast";
import { useCreateOrg } from "@/hooks/use-orgs";

/**
 * Create Organization Form
 * 
 * Signifiers: Clear labels and placeholders
 * Constraints: Validation before submission
 * Feedback: Loading state, success/error toasts
 * Error Tolerance: Helpful error messages
 */

const createOrgSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(50, "Organization name must be at most 50 characters"),
});

type CreateOrgForm = z.infer<typeof createOrgSchema>;

interface CreateOrgFormProps {
  onSuccess?: () => void;
}

export function CreateOrgForm({ onSuccess }: CreateOrgFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const createOrg = useCreateOrg();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrgForm>({
    resolver: zodResolver(createOrgSchema),
  });

  const onSubmit = async (data: CreateOrgForm) => {
    try {
      await createOrg.mutateAsync(data);
      onSuccess?.();
      router.push("/dashboard/orgs");
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const isSubmitting = createOrg.isPending;

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>Create Organization</CardTitle>
            <CardDescription>
              Organizations help you manage team access and billing.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Organization Name
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="name"
              placeholder="My Company"
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
              autoFocus
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
            <p className="text-sm text-muted-foreground">
              This will be visible to team members you invite.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Organization
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

