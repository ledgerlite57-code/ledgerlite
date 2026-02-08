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

export const creditNoteLineCreateSchema = z.object({
  itemId: optionalUuid,
  sourceInvoiceLineId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  incomeAccountId: optionalUuid,
  description: z.string().min(2),
  qty: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: optionalMoney,
  taxCodeId: optionalUuid,
});

export const creditNoteCreateSchema = z.object({
  customerId: requiredUuid,
  invoiceId: optionalUuid,
  returnInventory: z.boolean().optional(),
  creditNoteDate: dateField,
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  notes: optionalString,
  lines: z.array(creditNoteLineCreateSchema).min(1),
});

export const creditNoteUpdateSchema = creditNoteCreateSchema
  .partial()
  .extend({ lines: z.array(creditNoteLineCreateSchema).min(1).optional() });

export const creditNoteApplySchema = z.object({
  allocations: z
    .array(
      z.object({
        invoiceId: requiredUuid,
        amount: moneyPositiveSchema,
      }),
    )
    .min(1),
});

export const creditNoteUnapplySchema = z
  .object({
    invoiceId: optionalUuid,
  })
  .optional()
  .transform((value) => value ?? {});

export const creditNoteRefundSchema = z
  .object({
    bankAccountId: optionalUuid,
    paymentAccountId: optionalUuid,
    refundDate: dateField,
    amount: moneyPositiveSchema,
    reference: optionalString,
    memo: optionalString,
  })
  .refine((value) => Boolean(value.bankAccountId || value.paymentAccountId), {
    message: "Select a bank or cash account",
    path: ["paymentAccountId"],
  });

export type CreditNoteLineCreateInput = z.infer<typeof creditNoteLineCreateSchema>;
export type CreditNoteCreateInput = z.infer<typeof creditNoteCreateSchema>;
export type CreditNoteUpdateInput = z.infer<typeof creditNoteUpdateSchema>;
export type CreditNoteApplyInput = z.infer<typeof creditNoteApplySchema>;
export type CreditNoteUnapplyInput = z.infer<typeof creditNoteUnapplySchema>;
export type CreditNoteRefundInput = z.infer<typeof creditNoteRefundSchema>;
