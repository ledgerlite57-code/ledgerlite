import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const savedViewEntitySchema = z.enum([
  "invoices",
  "bills",
  "expenses",
  "payments-received",
  "credit-notes",
  "debit-notes",
  "vendor-payments",
  "pdc",
  "journals",
]);

const nameSchema = z.preprocess(emptyToUndefined, z.string().min(1).max(80));
const querySchema = z.record(z.string(), z.string());

export const savedViewCreateSchema = z.object({
  entityType: savedViewEntitySchema,
  name: nameSchema,
  query: querySchema.optional(),
});

export const savedViewUpdateSchema = z.object({
  name: nameSchema.optional(),
  query: querySchema.optional(),
});

export const savedViewListQuerySchema = z.object({
  entityType: savedViewEntitySchema.optional(),
});

export type SavedViewEntity = z.infer<typeof savedViewEntitySchema>;
export type SavedViewCreateInput = z.infer<typeof savedViewCreateSchema>;
export type SavedViewUpdateInput = z.infer<typeof savedViewUpdateSchema>;
export type SavedViewListQuery = z.infer<typeof savedViewListQuerySchema>;
