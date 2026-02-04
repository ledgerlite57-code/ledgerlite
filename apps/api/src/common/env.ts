import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_JWT_SECRET: z.string().min(1),
  API_JWT_REFRESH_SECRET: z.string().min(1),
  API_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  API_JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  API_CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  SMTP_DISABLE: z.coerce.boolean().optional().default(false),
  INVENTORY_COST_EFFECTIVE_DATE_ENABLED: z.coerce.boolean().optional().default(true),
  INVENTORY_COST_HIGH_PRECISION_QTY_ENABLED: z.coerce.boolean().optional().default(true),
  NEGATIVE_STOCK_POLICY_ENABLED: z.coerce.boolean().optional().default(true),
  INVITE_LIFECYCLE_ENABLED: z.coerce.boolean().optional().default(true),
  ONBOARDING_CHECKLIST_ENABLED: z.coerce.boolean().optional().default(true),
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_ENVIRONMENT: z.string().optional().default("development"),
});

export type ApiEnv = z.infer<typeof envSchema>;

let cachedEnv: ApiEnv | null = null;

export function getApiEnv(): ApiEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid API environment configuration: ${issues.join("; ")}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetApiEnvCache() {
  cachedEnv = null;
}
