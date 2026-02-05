import { z } from "zod";
import { decimalSchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const optionalDecimal = z.preprocess(emptyToUndefined, decimalSchema.optional());

export const reconciliationSessionCreateSchema = z.object({
  bankAccountId: requiredUuid,
  periodStart: dateField,
  periodEnd: dateField,
  statementOpeningBalance: decimalSchema,
  statementClosingBalance: decimalSchema,
});

export const reconciliationMatchSchema = z.object({
  bankTransactionId: requiredUuid,
  glHeaderId: requiredUuid,
  matchType: z.enum(["AUTO", "MANUAL", "SPLIT"]).optional(),
  amount: optionalDecimal,
});

export const reconciliationCloseSchema = z.object({
  statementClosingBalance: optionalDecimal,
});

export type ReconciliationSessionCreateInput = z.infer<typeof reconciliationSessionCreateSchema>;
export type ReconciliationMatchInput = z.infer<typeof reconciliationMatchSchema>;
export type ReconciliationCloseInput = z.infer<typeof reconciliationCloseSchema>;
