import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { resetApiEnvCache } from "../src/common/env";

describe("Tracing correlation (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= "postgresql://ledgerlite:ledgerlite@localhost:5432/ledgerlite";
    process.env.API_JWT_SECRET ??= "test_access_secret";
    process.env.API_JWT_REFRESH_SECRET ??= "test_refresh_secret";
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

  it("adds correlation headers for request id and trace", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["x-trace-id"]).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    const [, traceId] = response.headers.traceparent.split("-");
    expect(traceId).toBe(response.headers["x-trace-id"]);
  });

  it("propagates incoming trace id", async () => {
    const traceId = "11111111111111111111111111111111";
    const parentSpanId = "2222222222222222";
    const traceFlags = "01";
    const traceparent = `00-${traceId}-${parentSpanId}-${traceFlags}`;

    const response = await request(app.getHttpServer()).get("/health").set("traceparent", traceparent).expect(200);

    expect(response.headers["x-trace-id"]).toBe(traceId);
    expect(response.headers.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-${traceFlags}$`));
  });
});
