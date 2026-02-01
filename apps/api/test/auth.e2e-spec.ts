import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
const permissionCodes = ["HEALTH_VIEW", "ORG_READ"] as const;
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";

const getCookieValue = (cookies: string[] | undefined, name: string) => {
  if (!cookies) {
    return undefined;
  }
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!match) {
    return undefined;
  }
  return match.split(";")[0]?.split("=")[1];
};

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
      prisma.idempotencyKey.deleteMany(),
      prisma.invite.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.inventoryMovement.deleteMany(),
      prisma.item.deleteMany(),
      prisma.taxCode.deleteMany(),
      prisma.creditNoteLine.deleteMany(),
      prisma.creditNote.deleteMany(),
      prisma.expenseLine.deleteMany(),
      prisma.expense.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.vendor.deleteMany(),
      prisma.reconciliationMatch.deleteMany(),
      prisma.reconciliationSession.deleteMany(),
      prisma.bankTransaction.deleteMany(),
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
    const cookies = login.headers["set-cookie"] as unknown as string[] | undefined;
    const csrfToken = getCookieValue(cookies, "csrf_token");
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
      .set("x-csrf-token", csrfToken as string)
      .expect(201);
    expect(refresh.body.data.accessToken).toBeDefined();

    const refreshCookies = refresh.headers["set-cookie"] as unknown as string[] | undefined;
    const refreshedCsrf = getCookieValue(refreshCookies, "csrf_token") ?? csrfToken;

    await agent
      .post("/auth/logout")
      .set("x-csrf-token", refreshedCsrf as string)
      .expect(201);
  });

  it("requires org selection when multiple memberships exist", async () => {
    const agent = request.agent(app.getHttpServer());
    const user = await prisma.user.create({
      data: {
        email: "multi-org@ledgerlite.local",
        passwordHash: await argon2.hash("Password123!"),
      },
    });
    const orgA = await prisma.organization.create({
      data: { name: "Multi Org A", baseCurrency: "AED" },
    });
    const orgB = await prisma.organization.create({
      data: { name: "Multi Org B", baseCurrency: "AED" },
    });
    const roleA = await prisma.role.create({
      data: { orgId: orgA.id, name: "Owner", isSystem: true },
    });
    const roleB = await prisma.role.create({
      data: { orgId: orgB.id, name: "Owner", isSystem: true },
    });
    await prisma.membership.createMany({
      data: [
        { orgId: orgA.id, userId: user.id, roleId: roleA.id },
        { orgId: orgB.id, userId: user.id, roleId: roleB.id },
      ],
    });

    const conflict = await agent
      .post("/auth/login")
      .send({ email: "multi-org@ledgerlite.local", password: "Password123!" })
      .expect(409);

    expect(conflict.body?.ok).toBe(false);
    const orgs = conflict.body?.error?.details?.orgs;
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: orgA.id, name: orgA.name }),
        expect.objectContaining({ id: orgB.id, name: orgB.name }),
      ]),
    );

    const login = await agent
      .post("/auth/login")
      .send({ email: "multi-org@ledgerlite.local", password: "Password123!", orgId: orgB.id })
      .expect(201);
    const loginData = login.body?.data ?? login.body;
    expect(loginData?.orgId).toBe(orgB.id);
  });
});


