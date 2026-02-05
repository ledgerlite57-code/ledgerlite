import { z, type ZodIssue } from "zod";

const parseEnvironmentLabel = (value: unknown) => {
  if (typeof value !== "string") {
    return "DEV";
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "DEV";
  }
  if (normalized === "development" || normalized === "dev") {
    return "DEV";
  }
  if (normalized === "staging" || normalized === "stage") {
    return "STAGE";
  }
  if (normalized === "production" || normalized === "prod") {
    return "PROD";
  }
  return value;
};

const parseBooleanFlag = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  NEXT_PUBLIC_APP_VERSION: z.string().min(1).default("local-dev"),
  NEXT_PUBLIC_ENVIRONMENT_LABEL: z.preprocess(parseEnvironmentLabel, z.enum(["DEV", "STAGE", "PROD"])),
  NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED: z.preprocess(parseBooleanFlag, z.boolean().default(false)),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  NEXT_PUBLIC_ENVIRONMENT_LABEL: process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL,
  NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED: process.env.NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue: ZodIssue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid web environment configuration: ${issues.join("; ")}`);
}

export const env = parsed.data;
