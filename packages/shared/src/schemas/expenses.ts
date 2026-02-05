import { z } from "zod";
import { exchangeRateSchema as exchangeRateValueSchema, moneySchema, optionalMoneySchema, quantitySchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalMoney = optionalMoneySchema;
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const optionalUuidOrNull = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().uuid().nullable().optional(),
);
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const exchangeRateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? "1" : value),
  exchangeRateValueSchema,
);

export const expenseLineCreateSchema = z.object({
  expenseAccountId: requiredUuid,
  itemId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  description: z.string().min(2),
  qty: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: optionalMoney,
  taxCodeId: optionalUuid,
});

const expenseBaseSchema = z.object({
  vendorId: optionalUuidOrNull,
  bankAccountId: optionalUuid,
  paymentAccountId: optionalUuid,
  expenseDate: dateField,
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  notes: optionalString,
  lines: z.array(expenseLineCreateSchema).min(1),
});

export const expenseCreateSchema = expenseBaseSchema.superRefine((data, ctx) => {
  if (!data.bankAccountId && !data.paymentAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["paymentAccountId"],
      message: "Paid-from account is required",
    });
  }
});

export const expenseUpdateSchema = expenseBaseSchema
  .partial()
  .extend({ lines: z.array(expenseLineCreateSchema).min(1).optional() });

export type ExpenseLineCreateInput = z.infer<typeof expenseLineCreateSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
