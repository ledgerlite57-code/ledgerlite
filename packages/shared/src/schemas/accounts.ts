import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const requiredCode = z.preprocess(emptyToUndefined, z.string().min(1));

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
export const accountNormalBalanceSchema = z.enum(["DEBIT", "CREDIT"]);

export const accountCreateSchema = z.object({
  code: requiredCode,
  name: z.string().min(2),
  description: optionalString,
  type: accountTypeSchema,
  subtype: accountSubtypeSchema.optional(),
  parentAccountId: optionalUuid,
  normalBalance: accountNormalBalanceSchema.optional(),
  isReconcilable: z.boolean().optional(),
  taxCodeId: optionalUuid,
  externalCode: optionalString,
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const accountUpdateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  description: optionalString,
  type: accountTypeSchema.optional(),
  subtype: accountSubtypeSchema.optional(),
  parentAccountId: optionalUuid,
  normalBalance: accountNormalBalanceSchema.optional(),
  isReconcilable: z.boolean().optional(),
  taxCodeId: optionalUuid,
  externalCode: optionalString,
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
