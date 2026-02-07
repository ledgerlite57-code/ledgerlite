import { z } from "zod";
import { moneySchema, optionalMoneySchema, quantitySchema } from "./money";

const openingBalanceDraftLineSchema = z
  .object({
    accountId: z.string().uuid(),
    debit: optionalMoneySchema,
    credit: optionalMoneySchema,
  })
  .superRefine((data, ctx) => {
    const debit = Number(data.debit ?? 0);
    const credit = Number(data.credit ?? 0);
    if (debit > 0 && credit > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one of debit or credit can be provided",
        path: ["debit"],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one of debit or credit can be provided",
        path: ["credit"],
      });
    }
    if (debit <= 0 && credit <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debit or credit is required",
        path: ["debit"],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debit or credit is required",
        path: ["credit"],
      });
    }
  });

export const openingBalancesCutOverSchema = z.object({
  cutOverDate: z.coerce.date(),
});

export const openingBalancesDraftSchema = z.object({
  lines: z.array(openingBalanceDraftLineSchema),
});

export const openingBalancesImportCsvSchema = z.object({
  csv: z.string().min(1, "CSV content is required"),
  delimiter: z.string().optional(),
});

const openingInventoryDraftLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: quantitySchema,
  unitCost: moneySchema,
});

export const openingInventoryDraftSchema = z.object({
  lines: z.array(openingInventoryDraftLineSchema),
});

export type OpeningBalanceDraftLineInput = z.infer<typeof openingBalanceDraftLineSchema>;
export type OpeningBalancesCutOverInput = z.infer<typeof openingBalancesCutOverSchema>;
export type OpeningBalancesDraftInput = z.infer<typeof openingBalancesDraftSchema>;
export type OpeningBalancesImportCsvInput = z.infer<typeof openingBalancesImportCsvSchema>;
export type OpeningInventoryDraftInput = z.infer<typeof openingInventoryDraftSchema>;
export type OpeningInventoryDraftLineInput = z.infer<typeof openingInventoryDraftLineSchema>;
