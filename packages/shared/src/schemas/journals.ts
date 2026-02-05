import { z } from "zod";
import { moneySchema } from "./money";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional());
const requiredUuid = z.string().uuid();
const dateField = z.coerce.date();

export const journalLineCreateSchema = z
  .object({
    accountId: requiredUuid,
    debit: moneySchema,
    credit: moneySchema,
    description: optionalString,
    customerId: optionalUuid,
    vendorId: optionalUuid,
  })
  .superRefine((line, ctx) => {
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    const hasDebit = debit > 0;
    const hasCredit = credit > 0;

    if (hasDebit === hasCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["debit"],
        message: "Enter either a debit or credit amount.",
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credit"],
        message: "Enter either a debit or credit amount.",
      });
    }

    if (line.customerId && line.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "Select either a customer or vendor, not both.",
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendorId"],
        message: "Select either a customer or vendor, not both.",
      });
    }
  });

export const journalCreateSchema = z.object({
  journalDate: dateField,
  memo: optionalString,
  lines: z.array(journalLineCreateSchema).min(2),
});

export const journalUpdateSchema = journalCreateSchema
  .partial()
  .extend({ lines: z.array(journalLineCreateSchema).min(2).optional() });

export type JournalLineCreateInput = z.infer<typeof journalLineCreateSchema>;
export type JournalCreateInput = z.infer<typeof journalCreateSchema>;
export type JournalUpdateInput = z.infer<typeof journalUpdateSchema>;
