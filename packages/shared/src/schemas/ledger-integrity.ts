import { z } from "zod";

export const ledgerIntegrityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type LedgerIntegrityQueryInput = z.infer<typeof ledgerIntegrityQuerySchema>;
