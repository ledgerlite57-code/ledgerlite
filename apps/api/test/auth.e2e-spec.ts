import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
const permissionCodes = ["HEALTH_VIEW", "AUTH_SELF", "ORG_READ"] as const;
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.API_JWT_SECRET = "test_access_secret";
    process.env.API_JWT_REFRESH_SECRET = "test_refresh_secret";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestContextMiddleware);
    app.use(cookieParser());
    app.useGlobalFilters(new HttpErrorFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = moduleRef.get(PrismaService);

    await prisma.$transaction([
      prisma.gLLine.deleteMany(),
      prisma.gLHeader.deleteMany(),
      prisma.vendorPaymentAllocation.deleteMany(),
      prisma.vendorPayment.deleteMany(),
      prisma.billLine.deleteMany(),
      prisma.bill.deleteMany(),
      prisma.paymentReceivedAllocation.deleteMany(),
      prisma.paymentReceived.deleteMany(),
      prisma.invoiceLine.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.magicLinkToken.deleteMany(),
      prisma.idempotencyKey.deleteMany(),
      prisma.invite.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.item.deleteMany(),
      prisma.taxCode.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.vendor.deleteMany(),
      prisma.bankAccount.deleteMany(),
      prisma.account.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.rolePermission.deleteMany(),
      prisma.permission.deleteMany(),
      prisma.membership.deleteMany(),
      prisma.role.deleteMany(),
      prisma.user.deleteMany(),
      prisma.organization.deleteMany(),
    ]);

    const org = await prisma.organization.create({
      data: { name: "Test Org", baseCurrency: "AED" },
    });

    for (const code of permissionCodes) {
      await prisma.permission.create({
        data: { code, description: code },
      });
    }

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: permissionCodes.map((code) => ({
        roleId: role.id,
        permissionCode: code,
      })),
    });

    const user = await prisma.user.create({
      data: {
        email: "test@ledgerlite.local",
        passwordHash: await argon2.hash("Password123!"),
      },
    });

    await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("does not bootstrap a default owner on login", async () => {
    const agent = request.agent(app.getHttpServer());

    const response = await agent
      .post("/auth/login")
      .send({ email: "owner@ledgerlite.local", password: "Password123!" });

    expect(response.status).toBe(401);
    expect(response.body?.ok).toBe(false);
  });

  it("logs in and hits protected endpoint", async () => {
    const agent = request.agent(app.getHttpServer());

    const login = await agent
      .post("/auth/login")
      .send({ email: "test@ledgerlite.local", password: "Password123!" })
      .expect(201);

    const loginData = login.body?.data ?? login.body;
    const accessToken = loginData?.accessToken;
    expect(accessToken).toBeDefined();
    const noAuth = await agent.get("/health/protected");
    expect(noAuth.status).toBe(401);
    expect(noAuth.body?.ok).toBe(false);

    const protectedResponse = await agent
      .get("/health/protected")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(protectedResponse.body.ok).toBe(true);

    const refresh = await agent
      .post("/auth/refresh")
      .expect(201);
    expect(refresh.body.data.accessToken).toBeDefined();

    await agent
      .post("/auth/logout")
      .expect(201);
  });
});
