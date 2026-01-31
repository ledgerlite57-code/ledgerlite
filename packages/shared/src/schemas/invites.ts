import { z } from "zod";

export const inviteCreateSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(20),
  password: z
    .string()
    .min(8)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a number")
    .regex(/[^A-Za-z0-9]/, "Password must include a symbol"),
});

export const membershipUpdateSchema = z.object({
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;
