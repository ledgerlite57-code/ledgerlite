import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const reportRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((data) => data.to >= data.from, {
    message: "End date must be on or after start date",
    path: ["to"],
  });

export const reportAsOfSchema = z.object({
  asOf: z.coerce.date(),
});

export const reportLedgerLinesSchema = z
  .object({
    accountId: z.string().uuid(),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((data) => data.to >= data.from, {
    message: "End date must be on or after start date",
    path: ["to"],
  });

export const reportAgingSchema = reportAsOfSchema;
export const reportVatSummarySchema = reportRangeSchema;

export const reportFiltersSchema = reportRangeSchema.extend({
  accountId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;
export type ReportAsOfInput = z.infer<typeof reportAsOfSchema>;
export type ReportLedgerLinesInput = z.infer<typeof reportLedgerLinesSchema>;
export type ReportAgingInput = z.infer<typeof reportAgingSchema>;
export type ReportVatSummaryInput = z.infer<typeof reportVatSummarySchema>;
