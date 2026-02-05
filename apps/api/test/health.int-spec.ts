import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { resetApiEnvCache } from "../src/common/env";

describe("Health (integration)", () => {
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

  it("returns health payload envelope", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.data?.status).toBe("ok");
  });

  it("adds request and trace correlation headers", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.headers["x-trace-id"]).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    const [, traceIdInHeader] = response.headers.traceparent.split("-");
    expect(traceIdInHeader).toBe(response.headers["x-trace-id"]);
  });

  it("propagates incoming trace id through response headers", async () => {
    const incomingTraceId = "11111111111111111111111111111111";
    const incomingParentSpanId = "2222222222222222";
    const incomingTraceFlags = "01";
    const incomingTraceparent = `00-${incomingTraceId}-${incomingParentSpanId}-${incomingTraceFlags}`;

    const response = await request(app.getHttpServer())
      .get("/health")
      .set("traceparent", incomingTraceparent)
      .expect(200);

    expect(response.headers["x-trace-id"]).toBe(incomingTraceId);
    expect(response.headers.traceparent).toMatch(new RegExp(`^00-${incomingTraceId}-[0-9a-f]{16}-${incomingTraceFlags}$`));
  });
});
