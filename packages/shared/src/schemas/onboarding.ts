import { z } from "zod";

export const onboardingStepStatusSchema = z.enum(["PENDING", "COMPLETED", "NOT_APPLICABLE"]);

export const onboardingStepUpdateSchema = z.object({
  status: onboardingStepStatusSchema,
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type OnboardingStepStatus = z.infer<typeof onboardingStepStatusSchema>;
export type OnboardingStepUpdateInput = z.infer<typeof onboardingStepUpdateSchema>;
