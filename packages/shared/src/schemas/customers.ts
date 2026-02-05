import { z } from "zod";
import { optionalMoneySchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());
const optionalPhone = z.preprocess(emptyToUndefined, z.string().min(4).optional());
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional());
const optionalMoney = optionalMoneySchema;

export const customerCreateSchema = z.object({
  name: z.string().min(2),
  email: optionalEmail,
  phone: optionalPhone,
  billingAddress: optionalString,
  shippingAddress: optionalString,
  trn: optionalString,
  paymentTermsDays: optionalInt,
  creditLimit: optionalMoney,
  isActive: z.boolean().optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
