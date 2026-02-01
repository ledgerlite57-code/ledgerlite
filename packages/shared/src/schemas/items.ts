import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const optionalBoolean = z.preprocess(emptyToUndefined, z.boolean().optional());

export const itemTypeSchema = z.enum(["SERVICE", "INVENTORY", "FIXED_ASSET", "NON_INVENTORY_EXPENSE"]);

const itemBaseSchema = z.object({
  name: z.string().min(2),
  type: itemTypeSchema,
  sku: optionalString,
  salePrice: z.coerce.number().min(0),
  purchasePrice: optionalNumber,
  incomeAccountId: optionalUuid,
  expenseAccountId: optionalUuid,
  inventoryAccountId: optionalUuid,
  fixedAssetAccountId: optionalUuid,
  defaultTaxCodeId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  allowFractionalQty: optionalBoolean,
  trackInventory: optionalBoolean,
  reorderPoint: optionalNumber,
  openingQty: optionalNumber,
  openingValue: optionalNumber,
  isActive: z.boolean().optional(),
});

export const itemCreateSchema = itemBaseSchema.superRefine((data, ctx) => {
  if (data.type === "SERVICE") {
    if (!data.incomeAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["incomeAccountId"],
        message: "Income account is required for service items",
      });
    }
  }

  if (data.type === "INVENTORY") {
    if (!data.incomeAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["incomeAccountId"],
        message: "Income account is required for inventory items",
      });
    }
    if (!data.expenseAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expenseAccountId"],
        message: "COGS account is required for inventory items",
      });
    }
    if (!data.inventoryAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inventoryAccountId"],
        message: "Inventory asset account is required for inventory items",
      });
    }
    if (data.trackInventory === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackInventory"],
        message: "Inventory items must track inventory",
      });
    }
  }

  if (data.type === "FIXED_ASSET") {
    if (!data.fixedAssetAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fixedAssetAccountId"],
        message: "Fixed asset account is required for fixed asset items",
      });
    }
    if (data.trackInventory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackInventory"],
        message: "Fixed asset items cannot track inventory",
      });
    }
  }

  if (data.type === "NON_INVENTORY_EXPENSE") {
    if (!data.expenseAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expenseAccountId"],
        message: "Expense account is required for non-inventory expense items",
      });
    }
    if (data.trackInventory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trackInventory"],
        message: "Non-inventory expense items cannot track inventory",
      });
    }
  }
});

export const itemUpdateSchema = itemBaseSchema.partial();

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
