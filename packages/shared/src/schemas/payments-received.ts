import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const exchangeRateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? 1 : value),
  z.coerce.number().gt(0),
);

export const paymentReceivedAllocationSchema = z.object({
  invoiceId: requiredUuid,
  amount: z.coerce.number().gt(0),
});

export const paymentReceivedCreateSchema = z.object({
  customerId: requiredUuid,
  bankAccountId: requiredUuid,
  paymentDate: dateField,
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  memo: optionalString,
  allocations: z.array(paymentReceivedAllocationSchema).min(1),
});

export const paymentReceivedUpdateSchema = paymentReceivedCreateSchema
  .partial()
  .extend({ allocations: z.array(paymentReceivedAllocationSchema).min(1).optional() });

export type PaymentReceivedAllocationInput = z.infer<typeof paymentReceivedAllocationSchema>;
export type PaymentReceivedCreateInput = z.infer<typeof paymentReceivedCreateSchema>;
export type PaymentReceivedUpdateInput = z.infer<typeof paymentReceivedUpdateSchema>;
