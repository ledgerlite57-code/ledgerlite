import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../src/app.module";
import { resetApiEnvCache } from "../src/common/env";
import { applyZodSchemasToOpenApi } from "../src/swagger/zod-openapi";

describe("Swagger schemas (e2e)", () => {
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("adds request schemas for auth/org/accounting routes", () => {
    const config = new DocumentBuilder().setTitle("LedgerLite API").setVersion("1.0").addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, config, { deepScanRoutes: true });
    applyZodSchemasToOpenApi(app, document);

    const registerOperation = document.paths["/auth/register"]?.post as Record<string, unknown> | undefined;
    const registerSchema = (registerOperation?.requestBody as Record<string, any> | undefined)?.content?.[
      "application/json"
    ]?.schema as Record<string, unknown> | undefined;
    expect(registerSchema?.type).toBe("object");
    expect((registerSchema?.properties as Record<string, unknown>)?.email).toBeDefined();

    const orgCreateOperation = document.paths["/orgs"]?.post as Record<string, unknown> | undefined;
    const orgCreateSchema = (orgCreateOperation?.requestBody as Record<string, any> | undefined)?.content?.[
      "application/json"
    ]?.schema as Record<string, unknown> | undefined;
    expect(orgCreateSchema?.type).toBe("object");
    expect((orgCreateSchema?.properties as Record<string, unknown>)?.name).toBeDefined();

    const invoicesListOperation = document.paths["/invoices"]?.get as Record<string, unknown> | undefined;
    const invoicesParams = (invoicesListOperation?.parameters as Array<Record<string, unknown>> | undefined) ?? [];
    expect(invoicesParams.some((parameter) => parameter.in === "query")).toBe(true);
  });
});
