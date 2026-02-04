import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional());
const optionalPositiveInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional());
const requiredUuid = z.string().uuid();

export const orgAddressSchema = z.object({
  line1: z.string().min(1),
  line2: optionalString,
  city: z.string().min(1),
  region: optionalString,
  postalCode: optionalString,
  country: optionalString,
});

export const defaultLanguageSchema = z.enum(["en-US", "en-GB", "ar-AE"]);
export const dateFormatSchema = z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);
export const numberFormatSchema = z.enum(["1,234.56", "1.234,56"]);
export const vatBehaviorSchema = z.enum(["EXCLUSIVE", "INCLUSIVE"]);
export const reportBasisSchema = z.enum(["ACCRUAL", "CASH"]);
export const negativeStockPolicySchema = z.enum(["ALLOW", "WARN", "BLOCK"]);

export const numberingFormatSchema = z.object({
  prefix: z.string().min(1),
  nextNumber: z.coerce.number().int().min(1),
});

export const numberingFormatsSchema = z.object({
  invoice: numberingFormatSchema.optional(),
  bill: numberingFormatSchema.optional(),
  payment: numberingFormatSchema.optional(),
  vendorPayment: numberingFormatSchema.optional(),
  expense: numberingFormatSchema.optional(),
});

const orgBaseSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().min(2),
  tradeLicenseNumber: z.string().min(2),
  address: orgAddressSchema,
  phone: z.string().min(7),
  industryType: z.string().min(2),
  defaultLanguage: defaultLanguageSchema,
  dateFormat: dateFormatSchema,
  numberFormat: numberFormatSchema,
  countryCode: z.string().length(2),
  baseCurrency: z.string().length(3),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  vatEnabled: z.boolean(),
  vatTrn: optionalString,
  timeZone: z.string().min(1),
});

export const orgCreateSchema = orgBaseSchema.refine(
  (data) => !data.vatEnabled || Boolean(data.vatTrn),
  {
    path: ["vatTrn"],
    message: "VAT TRN is required when VAT is enabled",
  },
);

export const orgUpdateSchema = orgBaseSchema.partial().superRefine((data, ctx) => {
  if (data.vatEnabled && !data.vatTrn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vatTrn"],
      message: "VAT TRN is required when VAT is enabled",
    });
  }
});

export const orgSettingsUpdateSchema = z.object({
  invoicePrefix: optionalString,
  invoiceNextNumber: optionalPositiveInt,
  billPrefix: optionalString,
  billNextNumber: optionalPositiveInt,
  expensePrefix: optionalString,
  expenseNextNumber: optionalPositiveInt,
  paymentPrefix: optionalString,
  paymentNextNumber: optionalPositiveInt,
  vendorPaymentPrefix: optionalString,
  vendorPaymentNextNumber: optionalPositiveInt,
  defaultPaymentTerms: optionalInt,
  defaultVatBehavior: vatBehaviorSchema.optional(),
  defaultArAccountId: requiredUuid.optional(),
  defaultApAccountId: requiredUuid.optional(),
  defaultInventoryAccountId: requiredUuid.optional(),
  defaultFixedAssetAccountId: requiredUuid.optional(),
  defaultCogsAccountId: requiredUuid.optional(),
  reportBasis: reportBasisSchema.optional(),
  negativeStockPolicy: negativeStockPolicySchema.optional(),
  numberingFormats: numberingFormatsSchema.optional(),
  lockDate: z.union([z.coerce.date(), z.null()]).optional(),
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>;
