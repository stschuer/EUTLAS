import { z } from 'zod';

// Auth Validators
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// Org Validators
export const createOrgSchema = z.object({
  name: z
    .string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(50, 'Organization name must be at most 50 characters'),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'MEMBER', 'READONLY']),
});

// Project Validators
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(2, 'Project name must be at least 2 characters')
    .max(50, 'Project name must be at most 50 characters'),
  description: z
    .string()
    .max(200, 'Description must be at most 200 characters')
    .optional(),
});

// Cluster Validators
export const createClusterSchema = z.object({
  name: z
    .string()
    .min(3, 'Cluster name must be at least 3 characters')
    .max(30, 'Cluster name must be at most 30 characters')
    .regex(
      /^[a-z][a-z0-9-]*[a-z0-9]$/,
      'Cluster name must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number'
    ),
  plan: z.enum(['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE']),
  mongoVersion: z.enum(['6.0', '7.0']).optional(),
});

export const resizeClusterSchema = z.object({
  plan: z.enum(['DEV', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE']),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateClusterInput = z.infer<typeof createClusterSchema>;
export type ResizeClusterInput = z.infer<typeof resizeClusterSchema>;




