import { z } from "zod";

const trueLike = new Set(["1", "true", "yes", "y", "on"]);
const falseLike = new Set(["0", "false", "no", "n", "off"]);

function parseBooleanEnv(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (trueLike.has(normalized)) {
        return true;
      }
      if (falseLike.has(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean().default(defaultValue));
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_JWT_SECRET: z.string().min(1),
  API_JWT_REFRESH_SECRET: z.string().min(1),
  API_JWT_ACCESS_TTL: z.coerce.number().int().positive().default(28800),
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
  SMTP_DISABLE: parseBooleanEnv(false),
  INVENTORY_COST_EFFECTIVE_DATE_ENABLED: parseBooleanEnv(true),
  INVENTORY_COST_HIGH_PRECISION_QTY_ENABLED: parseBooleanEnv(true),
  NEGATIVE_STOCK_POLICY_ENABLED: parseBooleanEnv(true),
  INVITE_LIFECYCLE_ENABLED: parseBooleanEnv(true),
  ONBOARDING_CHECKLIST_ENABLED: parseBooleanEnv(true),
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_ENVIRONMENT: z.string().optional().default("development"),
  SENTRY_RELEASE: z.string().optional().default(""),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  API_SWAGGER_ENABLED: parseBooleanEnv(process.env.NODE_ENV !== "production"),
  API_SWAGGER_PATH: z.string().trim().min(1).default("docs"),
  API_SWAGGER_REQUIRE_AUTH: parseBooleanEnv(false),
  API_SWAGGER_AUTH_TOKEN: z.string().optional().default(""),
  OTEL_ENABLED: parseBooleanEnv(false),
  OTEL_SERVICE_NAME: z.string().optional().default("ledgerlite-api"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(""),
  OTEL_TRACES_SAMPLER_RATIO: z.coerce.number().min(0).max(1).default(0.05),
  ATTACHMENTS_DRIVER: z.enum(["local", "s3"]).default("local"),
  ATTACHMENTS_LOCAL_DIR: z.string().default("storage/attachments"),
  ATTACHMENTS_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  ATTACHMENTS_S3_BUCKET: z.string().optional().default(""),
  ATTACHMENTS_S3_REGION: z.string().optional().default("us-east-1"),
  ATTACHMENTS_S3_ENDPOINT: z.string().optional().default(""),
  ATTACHMENTS_S3_ACCESS_KEY_ID: z.string().optional().default(""),
  ATTACHMENTS_S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  ATTACHMENTS_S3_FORCE_PATH_STYLE: parseBooleanEnv(true),
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
