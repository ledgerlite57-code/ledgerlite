import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().optional());

export const reconciliationSessionCreateSchema = z.object({
  bankAccountId: requiredUuid,
  periodStart: dateField,
  periodEnd: dateField,
  statementOpeningBalance: z.coerce.number(),
  statementClosingBalance: z.coerce.number(),
});

export const reconciliationMatchSchema = z.object({
  bankTransactionId: requiredUuid,
  glHeaderId: requiredUuid,
  matchType: z.enum(["AUTO", "MANUAL", "SPLIT"]).optional(),
});

export const reconciliationCloseSchema = z.object({
  statementClosingBalance: optionalNumber,
});

export type ReconciliationSessionCreateInput = z.infer<typeof reconciliationSessionCreateSchema>;
export type ReconciliationMatchInput = z.infer<typeof reconciliationMatchSchema>;
export type ReconciliationCloseInput = z.infer<typeof reconciliationCloseSchema>;
