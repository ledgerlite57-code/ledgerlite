import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const exchangeRateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? 1 : value),
  z.coerce.number().gt(0),
);

export const creditNoteLineCreateSchema = z.object({
  itemId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  incomeAccountId: optionalUuid,
  description: z.string().min(2),
  qty: z.coerce.number().gt(0),
  unitPrice: z.coerce.number().min(0),
  discountAmount: optionalNumber,
  taxCodeId: optionalUuid,
});

export const creditNoteCreateSchema = z.object({
  customerId: requiredUuid,
  invoiceId: optionalUuid,
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
        amount: z.coerce.number().gt(0),
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

export type CreditNoteLineCreateInput = z.infer<typeof creditNoteLineCreateSchema>;
export type CreditNoteCreateInput = z.infer<typeof creditNoteCreateSchema>;
export type CreditNoteUpdateInput = z.infer<typeof creditNoteUpdateSchema>;
export type CreditNoteApplyInput = z.infer<typeof creditNoteApplySchema>;
export type CreditNoteUnapplyInput = z.infer<typeof creditNoteUnapplySchema>;
