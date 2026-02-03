import { z } from "zod";
import { strongPasswordSchema } from "./auth";

export const inviteCreateSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(20),
  password: strongPasswordSchema,
});

export const membershipUpdateSchema = z.object({
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;
