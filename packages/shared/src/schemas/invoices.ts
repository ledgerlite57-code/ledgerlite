import { z } from "zod";
import {
  exchangeRateSchema as exchangeRateValueSchema,
  optionalMoneySchema,
  quantitySchema,
  signedMoneySchema,
} from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalMoney = optionalMoneySchema;
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const dateField = z.coerce.date();
const exchangeRateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? "1" : value),
  exchangeRateValueSchema,
);

export const invoiceLineTypeSchema = z.enum(["ITEM", "SHIPPING", "ADJUSTMENT", "ROUNDING"]);

export const invoiceLineCreateSchema = z.object({
  itemId: optionalUuid,
  lineType: invoiceLineTypeSchema.optional(),
  unitOfMeasureId: optionalUuid,
  incomeAccountId: optionalUuid,
  description: z.string().min(2),
  qty: quantitySchema,
  unitPrice: signedMoneySchema,
  discountAmount: optionalMoney,
  taxCodeId: optionalUuid,
}).superRefine((data, ctx) => {
  const lineType = data.lineType ?? "ITEM";
  if (lineType === "ITEM") {
    if (!data.itemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemId"],
        message: "Item is required for invoice lines.",
      });
    }
  } else if (!data.incomeAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["incomeAccountId"],
      message: "Income account is required for non-item lines.",
    });
  }
  const unitPriceValue = typeof data.unitPrice === "string" ? Number(data.unitPrice) : data.unitPrice;
  if (lineType !== "ROUNDING" && Number.isFinite(unitPriceValue) && unitPriceValue < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unitPrice"],
      message: "Unit price must be greater than or equal to 0.",
    });
  }
  if (lineType === "ROUNDING" && data.taxCodeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["taxCodeId"],
      message: "Rounding lines cannot have tax applied.",
    });
  }
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
  salespersonName: optionalString,
  lines: z.array(invoiceLineCreateSchema).min(1),
});

export const invoiceUpdateSchema = invoiceCreateSchema
  .partial()
  .extend({ lines: z.array(invoiceLineCreateSchema).min(1).optional() });

export type InvoiceLineCreateInput = z.infer<typeof invoiceLineCreateSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
