import { z } from "zod";
import { exchangeRateSchema as exchangeRateValueSchema, moneySchema, optionalMoneySchema, quantitySchema } from "./money";

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

export const billLineCreateSchema = z.object({
  expenseAccountId: requiredUuid,
  itemId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  description: z.string().min(2),
  qty: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: optionalMoney,
  taxCodeId: optionalUuid,
});

export const billCreateSchema = z.object({
  vendorId: requiredUuid,
  billDate: dateField,
  dueDate: dateField.optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  billNumber: optionalString,
  reference: optionalString,
  notes: optionalString,
  lines: z.array(billLineCreateSchema).min(1),
});

export const billUpdateSchema = billCreateSchema
  .partial()
  .extend({ lines: z.array(billLineCreateSchema).min(1).optional() });

export type BillLineCreateInput = z.infer<typeof billLineCreateSchema>;
export type BillCreateInput = z.infer<typeof billCreateSchema>;
export type BillUpdateInput = z.infer<typeof billUpdateSchema>;
