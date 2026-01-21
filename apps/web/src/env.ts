import { z, type ZodIssue } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000"),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue: ZodIssue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid web environment configuration: ${issues.join("; ")}`);
}

export const env = parsed.data;
