import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const optionalBoolean = z.preprocess(emptyToUndefined, z.coerce.boolean().optional());
const requiredUuid = z.string().uuid();

export const bankAccountCreateSchema = z.object({
  name: z.string().min(2),
  glAccountId: requiredUuid,
  currency: z.string().length(3).optional(),
  accountNumberMasked: optionalString,
  openingBalance: optionalNumber,
  openingBalanceDate: optionalDate,
  isActive: optionalBoolean,
});

export const bankAccountUpdateSchema = bankAccountCreateSchema.partial();

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>;
