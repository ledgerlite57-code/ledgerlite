import { z } from "zod";
import {
  exchangeRateSchema as exchangeRateValueSchema,
  moneyPositiveSchema,
  moneySchema,
  optionalMoneySchema,
  quantitySchema,
} from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalMoney = optionalMoneySchema;
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const exchangeRateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? "1" : value),
  exchangeRateValueSchema,
);

export const debitNoteLineCreateSchema = z.object({
  itemId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  expenseAccountId: optionalUuid,
  description: z.string().min(2),
  qty: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: optionalMoney,
  taxCodeId: optionalUuid,
});

export const debitNoteCreateSchema = z.object({
  vendorId: requiredUuid,
  billId: optionalUuid,
  debitNoteDate: dateField,
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  notes: optionalString,
  lines: z.array(debitNoteLineCreateSchema).min(1),
});

export const debitNoteUpdateSchema = debitNoteCreateSchema
  .partial()
  .extend({ lines: z.array(debitNoteLineCreateSchema).min(1).optional() });

export const debitNoteApplySchema = z.object({
  allocations: z
    .array(
      z.object({
        billId: requiredUuid,
        amount: moneyPositiveSchema,
      }),
    )
    .min(1),
});

export const debitNoteUnapplySchema = z
  .object({
    billId: optionalUuid,
  })
  .optional()
  .transform((value) => value ?? {});

export type DebitNoteLineCreateInput = z.infer<typeof debitNoteLineCreateSchema>;
export type DebitNoteCreateInput = z.infer<typeof debitNoteCreateSchema>;
export type DebitNoteUpdateInput = z.infer<typeof debitNoteUpdateSchema>;
export type DebitNoteApplyInput = z.infer<typeof debitNoteApplySchema>;
export type DebitNoteUnapplyInput = z.infer<typeof debitNoteUnapplySchema>;
