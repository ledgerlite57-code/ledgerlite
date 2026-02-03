import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const strongPasswordSchema = z
  .string()
  .min(8)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol");

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  orgId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
