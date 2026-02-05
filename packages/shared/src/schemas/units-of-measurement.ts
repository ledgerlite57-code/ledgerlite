import { z } from "zod";
import { optionalQuantitySchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const optionalDecimal = optionalQuantitySchema;
const optionalBoolean = z.preprocess(emptyToUndefined, z.boolean().optional());

export const unitOfMeasureCreateSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  baseUnitId: optionalUuid,
  conversionRate: optionalDecimal,
  isActive: optionalBoolean,
});

export const unitOfMeasureUpdateSchema = unitOfMeasureCreateSchema.partial();

export type UnitOfMeasureCreateInput = z.infer<typeof unitOfMeasureCreateSchema>;
export type UnitOfMeasureUpdateInput = z.infer<typeof unitOfMeasureUpdateSchema>;
