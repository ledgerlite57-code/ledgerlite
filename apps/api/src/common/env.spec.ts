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
});
