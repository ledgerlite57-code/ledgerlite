import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const optionalBoolean = z.preprocess(emptyToUndefined, z.boolean().optional());

export const unitOfMeasureCreateSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  baseUnitId: optionalUuid,
  conversionRate: optionalNumber,
  isActive: optionalBoolean,
});

export const unitOfMeasureUpdateSchema = unitOfMeasureCreateSchema.partial();

export type UnitOfMeasureCreateInput = z.infer<typeof unitOfMeasureCreateSchema>;
export type UnitOfMeasureUpdateInput = z.infer<typeof unitOfMeasureUpdateSchema>;
