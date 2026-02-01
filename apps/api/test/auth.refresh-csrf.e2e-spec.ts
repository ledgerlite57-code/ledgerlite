import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";

const permissionCodes = ["HEALTH_VIEW", "ORG_READ"] as const;

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

describe("Auth refresh CSRF (e2e)", () => {
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
      data: { name: "Auth CSRF Org", baseCurrency: "AED" },
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
        email: "csrf@ledgerlite.local",
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

  it("requires CSRF when using refresh cookie and allows Authorization header", async () => {
    const agent = request.agent(app.getHttpServer());

    const login = await agent
      .post("/auth/login")
      .send({ email: "csrf@ledgerlite.local", password: "Password123!" })
      .expect(201);

    const cookies = login.headers["set-cookie"] as unknown as string[] | undefined;
    const refreshToken = getCookieValue(cookies, "refresh_token");
    const csrfToken = getCookieValue(cookies, "csrf_token");

    expect(refreshToken).toBeTruthy();
    expect(csrfToken).toBeTruthy();

    await agent.post("/auth/refresh").expect(401);

    const refreshResponse = await agent.post("/auth/refresh").set("x-csrf-token", csrfToken as string).expect(201);
    const refreshCookies = refreshResponse.headers["set-cookie"] as unknown as string[] | undefined;
    const refreshedToken = getCookieValue(refreshCookies, "refresh_token");

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Authorization", `Bearer ${refreshedToken}`)
      .expect(201);
  });
});

