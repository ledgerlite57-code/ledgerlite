import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  orgId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
