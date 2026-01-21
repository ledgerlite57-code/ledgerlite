import { z } from "zod";

export const taxTypeSchema = z.enum(["STANDARD", "ZERO", "EXEMPT", "OUT_OF_SCOPE"]);

export const taxCodeCreateSchema = z.object({
  name: z.string().min(2),
  rate: z.coerce.number().min(0).max(100),
  type: taxTypeSchema,
  isActive: z.boolean().optional(),
});

export const taxCodeUpdateSchema = taxCodeCreateSchema.partial();

export type TaxCodeCreateInput = z.infer<typeof taxCodeCreateSchema>;
export type TaxCodeUpdateInput = z.infer<typeof taxCodeUpdateSchema>;
