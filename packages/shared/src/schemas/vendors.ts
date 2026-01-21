import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());
const optionalPhone = z.preprocess(emptyToUndefined, z.string().min(4).optional());
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional());

export const vendorCreateSchema = z.object({
  name: z.string().min(2),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalString,
  trn: optionalString,
  paymentTermsDays: optionalInt,
  isActive: z.boolean().optional(),
});

export const vendorUpdateSchema = vendorCreateSchema.partial();

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;
