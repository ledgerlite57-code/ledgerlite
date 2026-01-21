import { z } from "zod";

export const orgCreateSchema = z.object({
  name: z.string().min(2),
  countryCode: z.string().length(2),
  baseCurrency: z.string().length(3),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  vatEnabled: z.boolean(),
  vatTrn: z.string().min(5).optional(),
  timeZone: z.string().min(1),
});

export const orgUpdateSchema = orgCreateSchema.partial();

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;
export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
