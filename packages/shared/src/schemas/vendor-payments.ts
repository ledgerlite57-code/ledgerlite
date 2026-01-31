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

export const vendorPaymentAllocationSchema = z.object({
  billId: requiredUuid,
  amount: z.coerce.number().gt(0),
});

export const vendorPaymentCreateSchema = z.object({
  vendorId: requiredUuid,
  bankAccountId: requiredUuid,
  paymentDate: dateField,
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  memo: optionalString,
  allocations: z.array(vendorPaymentAllocationSchema).min(1),
});

export const vendorPaymentUpdateSchema = vendorPaymentCreateSchema
  .partial()
  .extend({ allocations: z.array(vendorPaymentAllocationSchema).min(1).optional() });

export type VendorPaymentAllocationInput = z.infer<typeof vendorPaymentAllocationSchema>;
export type VendorPaymentCreateInput = z.infer<typeof vendorPaymentCreateSchema>;
export type VendorPaymentUpdateInput = z.infer<typeof vendorPaymentUpdateSchema>;
