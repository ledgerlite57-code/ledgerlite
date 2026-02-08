import { z } from "zod";
import { paginationSchema } from "./pagination";
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

export const purchaseOrderLineCreateSchema = z.object({
  expenseAccountId: requiredUuid,
  itemId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  description: z.string().min(2),
  qty: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: optionalMoney,
  taxCodeId: optionalUuid,
});

export const purchaseOrderCreateSchema = z.object({
  vendorId: requiredUuid,
  poDate: dateField,
  expectedDeliveryDate: dateField.optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  poNumber: optionalString,
  reference: optionalString,
  notes: optionalString,
  lines: z.array(purchaseOrderLineCreateSchema).min(1),
});

export const purchaseOrderUpdateSchema = purchaseOrderCreateSchema
  .partial()
  .extend({ lines: z.array(purchaseOrderLineCreateSchema).min(1).optional() });

export const purchaseOrderReceiveSchema = z.object({
  receiptDate: dateField,
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        qty: quantitySchema,
      }),
    )
    .min(1),
});

export const purchaseOrderConvertSchema = z.object({
  billDate: dateField,
  dueDate: dateField.optional(),
  billNumber: optionalString,
  reference: optionalString,
  notes: optionalString,
  basis: z.enum(["RECEIVED", "ORDERED"]).default("RECEIVED"),
  lineIds: z.array(z.string().uuid()).min(1).optional(),
});

export const purchaseOrderRejectSchema = z.object({
  reason: z.preprocess(emptyToUndefined, z.string().min(2).max(500).optional()),
});

export const purchaseOrderListQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

export type PurchaseOrderLineCreateInput = z.infer<typeof purchaseOrderLineCreateSchema>;
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;
export type PurchaseOrderReceiveInput = z.infer<typeof purchaseOrderReceiveSchema>;
export type PurchaseOrderConvertInput = z.infer<typeof purchaseOrderConvertSchema>;
export type PurchaseOrderRejectInput = z.infer<typeof purchaseOrderRejectSchema>;
export type PurchaseOrderListQueryInput = z.infer<typeof purchaseOrderListQuerySchema>;
