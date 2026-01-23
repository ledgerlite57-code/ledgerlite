import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const optionalBoolean = z.preprocess(emptyToUndefined, z.boolean().optional());

export const itemTypeSchema = z.enum(["SERVICE", "PRODUCT"]);

export const itemCreateSchema = z.object({
  name: z.string().min(2),
  type: itemTypeSchema,
  sku: optionalString,
  salePrice: z.coerce.number().min(0),
  purchasePrice: optionalNumber,
  incomeAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  defaultTaxCodeId: optionalUuid,
  unitOfMeasureId: optionalUuid,
  allowFractionalQty: optionalBoolean,
  trackInventory: optionalBoolean,
  reorderPoint: optionalNumber,
  openingQty: optionalNumber,
  openingValue: optionalNumber,
  isActive: z.boolean().optional(),
});

export const itemUpdateSchema = itemCreateSchema.partial();

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
