import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Saved Views (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.savedView.deleteMany();
    await prisma.gLLine.deleteMany();
    await prisma.gLHeader.deleteMany();
    await prisma.vendorPaymentAllocation.deleteMany();
    await prisma.vendorPayment.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.paymentReceivedAllocation.deleteMany();
    await prisma.paymentReceived.deleteMany();
    await prisma.invoiceLine.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.invite.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.item.deleteMany();
    await prisma.unitOfMeasure.deleteMany({ where: { baseUnitId: { not: null } } });
    await prisma.unitOfMeasure.deleteMany();
    await prisma.taxCode.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.vendor.deleteMany();
    await prisma.reconciliationMatch.deleteMany();
    await prisma.reconciliationSession.deleteMany();
    await prisma.bankTransaction.deleteMany();
    await prisma.bankAccount.deleteMany();
    await prisma.account.deleteMany();
    await prisma.orgSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.role.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  };

  const seedOrg = async (name: string, emailSuffix: string) => {
    const permissions = [Permissions.ORG_READ];
    await prisma.permission.createMany({
      data: permissions.map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name, baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: false },
    });
    await prisma.unitOfMeasure.create({
      data: {
        orgId: org.id,
        name: "Each",
        symbol: "ea",
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((code) => ({ roleId: role.id, permissionCode: code })),
    });

    const user = await prisma.user.create({
      data: { email: `savedviews-${emailSuffix}-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, role, user, token };
  };

  const createUserForOrg = async (orgId: string, roleId: string, emailSuffix: string) => {
    const user = await prisma.user.create({
      data: { email: `savedviews-user-${emailSuffix}-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId, userId: user.id, roleId, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId, membershipId: membership.id, roleId },
      { secret: process.env.API_JWT_SECRET },
    );

    return { user, token };
  };

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
    jwt = moduleRef.get(JwtService);
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
  });

  it("isolates saved views by org and user", async () => {
    const orgOne = await seedOrg("Saved Views Org One", "one");
    const orgTwo = await seedOrg("Saved Views Org Two", "two");
    const orgOneUserTwo = await createUserForOrg(orgOne.org.id, orgOne.role.id, "org-one");

    const createRes = await request(app.getHttpServer())
      .post("/saved-views")
      .set("Authorization", `Bearer ${orgOne.token}`)
      .send({ entityType: "invoices", name: "Posted invoices", query: { status: "POSTED" } })
      .expect(201);

    const viewId = createRes.body.data.id as string;

    const listOrgOne = await request(app.getHttpServer())
      .get("/saved-views?entityType=invoices")
      .set("Authorization", `Bearer ${orgOne.token}`)
      .expect(200);
    expect(listOrgOne.body.data).toHaveLength(1);

    const listOrgOneUserTwo = await request(app.getHttpServer())
      .get("/saved-views?entityType=invoices")
      .set("Authorization", `Bearer ${orgOneUserTwo.token}`)
      .expect(200);
    expect(listOrgOneUserTwo.body.data).toHaveLength(0);

    const listOrgTwo = await request(app.getHttpServer())
      .get("/saved-views?entityType=invoices")
      .set("Authorization", `Bearer ${orgTwo.token}`)
      .expect(200);
    expect(listOrgTwo.body.data).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/saved-views/${viewId}`)
      .set("Authorization", `Bearer ${orgOneUserTwo.token}`)
      .send({ name: "Nope" })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/saved-views/${viewId}`)
      .set("Authorization", `Bearer ${orgTwo.token}`)
      .expect(404);
  });
});


