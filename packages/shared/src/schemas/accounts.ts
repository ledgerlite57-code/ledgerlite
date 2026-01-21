import { z } from "zod";

export const accountTypeSchema = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
export const accountSubtypeSchema = z.enum([
  "BANK",
  "CASH",
  "AR",
  "AP",
  "VAT_RECEIVABLE",
  "VAT_PAYABLE",
  "SALES",
  "EXPENSE",
  "EQUITY",
  "CUSTOMER_ADVANCES",
  "VENDOR_PREPAYMENTS",
]);

export const accountCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(2),
  type: accountTypeSchema,
  subtype: accountSubtypeSchema.optional(),
  isActive: z.boolean().optional(),
});

export const accountUpdateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  type: accountTypeSchema.optional(),
  subtype: accountSubtypeSchema.optional(),
  isActive: z.boolean().optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
