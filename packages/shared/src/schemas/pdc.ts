import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const exchangeRateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? 1 : value),
  z.coerce.number().gt(0),
);

export const pdcDirectionSchema = z.enum(["INCOMING", "OUTGOING"]);
export const pdcStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "DEPOSITED",
  "CLEARED",
  "BOUNCED",
  "CANCELLED",
]);

export const pdcAllocationSchema = z
  .object({
    invoiceId: optionalUuid,
    billId: optionalUuid,
    amount: z.coerce.number().gt(0),
  })
  .refine(
    (value) => {
      const hasInvoice = Boolean(value.invoiceId);
      const hasBill = Boolean(value.billId);
      return hasInvoice !== hasBill;
    },
    {
      message: "Allocation must reference either an invoice or a bill",
      path: ["invoiceId"],
    },
  );

const pdcBaseSchema = z.object({
  direction: pdcDirectionSchema,
  customerId: optionalUuid,
  vendorId: optionalUuid,
  bankAccountId: requiredUuid,
  chequeNumber: z.preprocess(emptyToUndefined, z.string().min(1)),
  chequeDate: dateField,
  expectedClearDate: dateField,
  currency: z.string().length(3).optional(),
  exchangeRate: exchangeRateSchema,
  reference: optionalString,
  memo: optionalString,
  allocations: z.array(pdcAllocationSchema).min(1),
});

export const pdcCreateSchema = pdcBaseSchema.superRefine((value, ctx) => {
  const isIncoming = value.direction === "INCOMING";
  const hasCustomer = Boolean(value.customerId);
  const hasVendor = Boolean(value.vendorId);

  if (isIncoming) {
    if (!hasCustomer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Customer is required for incoming PDC",
        path: ["customerId"],
      });
    }
    if (hasVendor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vendor is not allowed for incoming PDC",
        path: ["vendorId"],
      });
    }
  } else {
    if (!hasVendor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vendor is required for outgoing PDC",
        path: ["vendorId"],
      });
    }
    if (hasCustomer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Customer is not allowed for outgoing PDC",
        path: ["customerId"],
      });
    }
  }

  for (const [index, allocation] of value.allocations.entries()) {
    if (isIncoming && !allocation.invoiceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incoming PDC allocations must reference invoices",
        path: ["allocations", index, "invoiceId"],
      });
    }
    if (isIncoming && allocation.billId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incoming PDC allocations cannot reference bills",
        path: ["allocations", index, "billId"],
      });
    }
    if (!isIncoming && !allocation.billId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Outgoing PDC allocations must reference bills",
        path: ["allocations", index, "billId"],
      });
    }
    if (!isIncoming && allocation.invoiceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Outgoing PDC allocations cannot reference invoices",
        path: ["allocations", index, "invoiceId"],
      });
    }
  }
});

export const pdcUpdateSchema = pdcBaseSchema
  .partial()
  .extend({ allocations: z.array(pdcAllocationSchema).min(1).optional() });

export type PdcDirectionInput = z.infer<typeof pdcDirectionSchema>;
export type PdcStatusInput = z.infer<typeof pdcStatusSchema>;
export type PdcAllocationInput = z.infer<typeof pdcAllocationSchema>;
export type PdcCreateInput = z.infer<typeof pdcCreateSchema>;
export type PdcUpdateInput = z.infer<typeof pdcUpdateSchema>;
