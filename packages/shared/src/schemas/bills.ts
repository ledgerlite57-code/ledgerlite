import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();

export const billLineCreateSchema = z.object({
  expenseAccountId: requiredUuid,
  itemId: optionalUuid,
  description: z.string().min(2),
  qty: z.coerce.number().gt(0),
  unitPrice: z.coerce.number().min(0),
  discountAmount: optionalNumber,
  taxCodeId: optionalUuid,
});

export const billCreateSchema = z.object({
  vendorId: requiredUuid,
  billDate: dateField,
  dueDate: dateField.optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: optionalNumber,
  billNumber: optionalString,
  notes: optionalString,
  lines: z.array(billLineCreateSchema).min(1),
});

export const billUpdateSchema = billCreateSchema
  .partial()
  .extend({ lines: z.array(billLineCreateSchema).min(1).optional() });

export type BillLineCreateInput = z.infer<typeof billLineCreateSchema>;
export type BillCreateInput = z.infer<typeof billCreateSchema>;
export type BillUpdateInput = z.infer<typeof billUpdateSchema>;
