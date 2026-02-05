import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { getApiEnv, resetApiEnvCache } from "../src/common/env";
import { setupSwagger } from "../src/swagger/setup-swagger";

const originalEnv = { ...process.env };

function applyBaseEnv() {
  process.env.DATABASE_URL ??= "postgresql://ledgerlite:ledgerlite@localhost:5432/ledgerlite";
  process.env.API_JWT_SECRET ??= "test_access_secret";
  process.env.API_JWT_REFRESH_SECRET ??= "test_refresh_secret";
  process.env.API_CORS_ORIGIN ??= "http://localhost:3000";
  process.env.WEB_BASE_URL ??= "http://localhost:3000";
}

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  return moduleRef.createNestApplication();
}

describe("Swagger setup access policy (e2e)", () => {
  afterEach(async () => {
    process.env = { ...originalEnv };
    resetApiEnvCache();
  });

  it("does not expose docs when disabled", async () => {
    applyBaseEnv();
    process.env.API_SWAGGER_ENABLED = "false";
    resetApiEnvCache();

    const app = await createApp();
    setupSwagger(app, getApiEnv());
    await app.init();

    await request(app.getHttpServer()).get("/docs").expect(404);
    await request(app.getHttpServer()).get("/docs-json").expect(404);

    await app.close();
  });

  it("uses configured docs path when enabled", async () => {
    applyBaseEnv();
    process.env.API_SWAGGER_ENABLED = "true";
    process.env.API_SWAGGER_PATH = "api/docs";
    process.env.API_SWAGGER_REQUIRE_AUTH = "false";
    resetApiEnvCache();

    const app = await createApp();
    setupSwagger(app, getApiEnv());
    await app.init();

    await request(app.getHttpServer()).get("/api/docs-json").expect(200);
    await request(app.getHttpServer()).get("/docs-json").expect(404);

    await app.close();
  });

  it("enforces bearer token when auth policy is enabled", async () => {
    applyBaseEnv();
    process.env.API_SWAGGER_ENABLED = "true";
    process.env.API_SWAGGER_PATH = "docs";
    process.env.API_SWAGGER_REQUIRE_AUTH = "true";
    process.env.API_SWAGGER_AUTH_TOKEN = "swagger-secret-token";
    resetApiEnvCache();

    const app = await createApp();
    setupSwagger(app, getApiEnv());
    await app.init();

    await request(app.getHttpServer()).get("/docs-json").expect(401);
    await request(app.getHttpServer()).get("/docs-json").set("Authorization", "Bearer wrong-token").expect(401);
    await request(app.getHttpServer())
      .get("/docs-json")
      .set("Authorization", "Bearer swagger-secret-token")
      .expect(200);

    await app.close();
  });

  it("fails fast when auth policy is enabled without token", async () => {
    applyBaseEnv();
    process.env.API_SWAGGER_ENABLED = "true";
    process.env.API_SWAGGER_REQUIRE_AUTH = "true";
    delete process.env.API_SWAGGER_AUTH_TOKEN;
    resetApiEnvCache();

    const app = await createApp();

    expect(() => setupSwagger(app, getApiEnv())).toThrow(
      "Invalid API environment configuration: API_SWAGGER_AUTH_TOKEN is required when API_SWAGGER_REQUIRE_AUTH=true",
    );

    await app.close();
  });
});
