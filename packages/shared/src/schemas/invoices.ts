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
  z.coerce.number().min(0),
);

export const invoiceLineCreateSchema = z.object({
  itemId: requiredUuid,
  unitOfMeasureId: optionalUuid,
  incomeAccountId: optionalUuid,
  description: z.string().min(2),
  qty: z.coerce.number().gt(0),
  unitPrice: z.coerce.number().min(0),
  discountAmount: optionalNumber,
  taxCodeId: optionalUuid,
});

export const invoiceCreateSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: dateField,
  dueDate: dateField.optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  notes: optionalString,
  terms: optionalString,
  lines: z.array(invoiceLineCreateSchema).min(1),
});

export const invoiceUpdateSchema = invoiceCreateSchema
  .partial()
  .extend({ lines: z.array(invoiceLineCreateSchema).min(1).optional() });

export type InvoiceLineCreateInput = z.infer<typeof invoiceLineCreateSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
