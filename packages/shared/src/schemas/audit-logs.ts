import { z } from "zod";
import { paginationSchema } from "./pagination";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const auditLogQuerySchema = paginationSchema.extend({
  from: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  to: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  entityType: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  actor: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
