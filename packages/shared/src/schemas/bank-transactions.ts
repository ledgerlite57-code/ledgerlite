import { z } from "zod";
import { decimalSchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();

export const bankTransactionImportLineSchema = z.object({
  txnDate: dateField,
  description: z.string().min(1),
  amount: decimalSchema,
  currency: z.string().length(3).optional(),
  externalRef: optionalString,
});

export const bankTransactionImportSchema = z.object({
  bankAccountId: requiredUuid,
  transactions: z.array(bankTransactionImportLineSchema).min(1),
});

export type BankTransactionImportLineInput = z.infer<typeof bankTransactionImportLineSchema>;
export type BankTransactionImportInput = z.infer<typeof bankTransactionImportSchema>;
