import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { resetApiEnvCache } from "../src/common/env";

describe("Metrics (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= "postgresql://ledgerlite:ledgerlite@localhost:5432/ledgerlite";
    process.env.API_JWT_SECRET ??= "test_access_secret";
    process.env.API_JWT_REFRESH_SECRET ??= "test_refresh_secret";
    process.env.SENTRY_ENVIRONMENT ??= "test";
    resetApiEnvCache();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestContextMiddleware);
    app.use(cookieParser());
    app.useGlobalFilters(new HttpErrorFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns prometheus text format", async () => {
    const response = await request(app.getHttpServer()).get("/metrics").expect(200);

    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("# HELP ledgerlite_build_info");
    expect(response.text).toContain("# HELP ledgerlite_http_requests_total");
    expect(response.text).toContain("# HELP ledgerlite_http_request_duration_seconds");
  });
});
