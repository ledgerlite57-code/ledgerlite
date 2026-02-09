import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional());
const optionalPositiveInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional());
const optionalNonNegativeNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const requiredUuid = z.string().uuid();

export const orgAddressSchema = z.object({
  line1: optionalString,
  line2: optionalString,
  city: optionalString,
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
export const salesDiscountTypeSchema = z.enum(["NONE", "LINE_ITEM", "TRANSACTION"]);
export const salesRoundingTypeSchema = z.enum(["NONE", "NEAREST_WHOLE", "NEAREST_INCREMENT"]);

const optionalLanguage = z.preprocess(emptyToUndefined, defaultLanguageSchema.optional());
const optionalDateFormat = z.preprocess(emptyToUndefined, dateFormatSchema.optional());
const optionalNumberFormat = z.preprocess(emptyToUndefined, numberFormatSchema.optional());
const auditReasonSchema = z.string().trim().min(5).max(500);

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
  legalName: optionalString,
  tradeLicenseNumber: optionalString,
  address: orgAddressSchema.optional(),
  phone: optionalString,
  industryType: optionalString,
  defaultLanguage: optionalLanguage,
  dateFormat: optionalDateFormat,
  numberFormat: optionalNumberFormat,
  countryCode: z.string().length(2),
  baseCurrency: z.string().length(3),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  vatEnabled: z.boolean().optional(),
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
  purchaseOrderApprovalThreshold: optionalNonNegativeNumber,
  defaultVatBehavior: vatBehaviorSchema.optional(),
  defaultArAccountId: requiredUuid.optional(),
  defaultApAccountId: requiredUuid.optional(),
  defaultInventoryAccountId: requiredUuid.optional(),
  defaultFixedAssetAccountId: requiredUuid.optional(),
  defaultCogsAccountId: requiredUuid.optional(),
  reportBasis: reportBasisSchema.optional(),
  negativeStockPolicy: negativeStockPolicySchema.optional(),
  salesDiscountType: salesDiscountTypeSchema.optional(),
  salesEnableAdjustments: z.boolean().optional(),
  salesEnableShipping: z.boolean().optional(),
  salesRoundingType: salesRoundingTypeSchema.optional(),
  salesRoundingIncrement: optionalNonNegativeNumber,
  salesEnableSalesperson: z.boolean().optional(),
  salesPreferencesConfiguredAt: z.union([z.coerce.date(), z.null()]).optional(),
  numberingFormats: numberingFormatsSchema.optional(),
  lockDate: z.union([z.coerce.date(), z.null()]).optional(),
});

export const platformOrgStatusUpdateSchema = z.object({
  isActive: z.boolean(),
  reason: auditReasonSchema,
});

export const platformOrgLockDateUpdateSchema = z.object({
  lockDate: z.union([z.coerce.date(), z.null()]),
  reason: auditReasonSchema,
});

export const platformOrgResetSettingsSchema = z.object({
  reason: auditReasonSchema,
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>;
export type PlatformOrgStatusUpdateInput = z.infer<typeof platformOrgStatusUpdateSchema>;
export type PlatformOrgLockDateUpdateInput = z.infer<typeof platformOrgLockDateUpdateSchema>;
export type PlatformOrgResetSettingsInput = z.infer<typeof platformOrgResetSettingsSchema>;
