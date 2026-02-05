"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useCreateProject } from "@/hooks/use-projects";

/**
 * Create Project Form
 * 
 * Signifiers: Clear labels, optional field indicator
 * Constraints: Character limits
 * Feedback: Loading state, success/error
 */

const createProjectSchema = z.object({
  name: z
    .string()
    .min(2, "Project name must be at least 2 characters")
    .max(50, "Project name must be at most 50 characters"),
  description: z
    .string()
    .max(200, "Description must be at most 200 characters")
    .optional(),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

interface CreateProjectFormProps {
  orgId: string;
  onSuccess?: () => void;
}

export function CreateProjectForm({ orgId, onSuccess }: CreateProjectFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const createProject = useCreateProject(orgId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
  });

  const descriptionLength = watch("description")?.length ?? 0;

  const onSubmit = async (data: CreateProjectForm) => {
    try {
      await createProject.mutateAsync(data);
      onSuccess?.();
      router.push(`/dashboard/orgs/${orgId}`);
    } catch (error) {
      // Error handling is done in the hook
    }
  };
  
  const isSubmitting = createProject.isPending;

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent/10 p-2">
            <FolderKanban className="h-6 w-6 text-accent" />
          </div>
          <div>
            <CardTitle>Create Project</CardTitle>
            <CardDescription>
              Projects help you organize clusters for different environments.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Project Name
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Production"
              {...register("name")}
              className={errors.name ? "border-destructive" : ""}
              autoFocus
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description - Optional with character count */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description
              <span className="text-muted-foreground ml-1">(optional)</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Production environment for our main application"
              {...register("description")}
              className={errors.description ? "border-destructive" : ""}
              rows={3}
            />
            <div className="flex justify-between text-sm">
              {errors.description ? (
                <p className="text-destructive">{errors.description.message}</p>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                {descriptionLength}/200
              </span>
            </div>
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
            Create Project
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

