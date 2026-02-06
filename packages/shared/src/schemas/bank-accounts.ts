import { z } from "zod";
import { currencyCodes } from "../constants/currencies";
import { optionalSignedMoneySchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalSignedMoney = optionalSignedMoneySchema;
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const optionalBoolean = z.preprocess(emptyToUndefined, z.coerce.boolean().optional());
const requiredUuid = z.string().uuid();
const optionalCurrency = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z
    .string()
    .length(3)
    .refine((value) => currencyCodes.includes(value), { message: "Unsupported currency code." })
    .optional(),
);

export const bankAccountCreateSchema = z.object({
  name: z.string().min(2),
  glAccountId: requiredUuid,
  currency: optionalCurrency,
  accountNumberMasked: optionalString,
  openingBalance: optionalSignedMoney,
  openingBalanceDate: optionalDate,
  isActive: optionalBoolean,
});

export const bankAccountUpdateSchema = bankAccountCreateSchema.partial();

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>;
