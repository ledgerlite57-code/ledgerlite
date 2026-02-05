import { getApiEnv, resetApiEnvCache } from "./env";

const originalEnv = { ...process.env };

describe("getApiEnv", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    resetApiEnvCache();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetApiEnvCache();
  });

  it("throws when required env vars are missing", () => {
    delete process.env.API_JWT_SECRET;
    delete process.env.API_JWT_REFRESH_SECRET;
    delete process.env.DATABASE_URL;

    expect(() => getApiEnv()).toThrow("Invalid API environment configuration");
  });

  it("returns parsed values when env vars are valid", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.API_JWT_SECRET = "secret";
    process.env.API_JWT_REFRESH_SECRET = "refresh";
    process.env.API_PORT = "4100";

    const env = getApiEnv();
    expect(env.API_PORT).toBe(4100);
    expect(env.API_JWT_SECRET).toBe("secret");
  });

  it("parses boolean env flags from string literals", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.API_JWT_SECRET = "secret";
    process.env.API_JWT_REFRESH_SECRET = "refresh";
    process.env.SMTP_DISABLE = "false";
    process.env.INVENTORY_COST_EFFECTIVE_DATE_ENABLED = "0";
    process.env.NEGATIVE_STOCK_POLICY_ENABLED = "true";
    process.env.OTEL_ENABLED = "yes";
    process.env.OTEL_TRACES_SAMPLER_RATIO = "0.2";
    process.env.SENTRY_TRACES_SAMPLE_RATE = "0.1";
    process.env.SENTRY_PROFILES_SAMPLE_RATE = "0.05";
    process.env.API_SWAGGER_ENABLED = "1";
    process.env.API_SWAGGER_REQUIRE_AUTH = "true";
    process.env.API_SWAGGER_PATH = "/internal/docs/";
    process.env.API_SWAGGER_AUTH_TOKEN = "test-token";

    const env = getApiEnv();
    expect(env.SMTP_DISABLE).toBe(false);
    expect(env.INVENTORY_COST_EFFECTIVE_DATE_ENABLED).toBe(false);
    expect(env.NEGATIVE_STOCK_POLICY_ENABLED).toBe(true);
    expect(env.OTEL_ENABLED).toBe(true);
    expect(env.OTEL_TRACES_SAMPLER_RATIO).toBe(0.2);
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(env.SENTRY_PROFILES_SAMPLE_RATE).toBe(0.05);
    expect(env.API_SWAGGER_ENABLED).toBe(true);
    expect(env.API_SWAGGER_REQUIRE_AUTH).toBe(true);
    expect(env.API_SWAGGER_PATH).toBe("/internal/docs/");
    expect(env.API_SWAGGER_AUTH_TOKEN).toBe("test-token");
  });
});
