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

describe("Pagination vendors (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.attachment.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
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
    await prisma.magicLinkToken.deleteMany();
    await prisma.invite.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.item.deleteMany();
    await prisma.unitOfMeasure.deleteMany({ where: { baseUnitId: { not: null } } });
    await prisma.unitOfMeasure.deleteMany();
    await prisma.taxCode.deleteMany();
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

  const seedOrg = async (permissions: string[]) => {
    if (permissions.length > 0) {
      await prisma.permission.createMany({
        data: permissions.map((code) => ({ code, description: code })),
        skipDuplicates: true,
      });
    }

    const org = await prisma.organization.create({
      data: { name: "Pagination Vendors Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((code) => ({ roleId: role.id, permissionCode: code })),
      });
    }

    const user = await prisma.user.create({
      data: { email: `vendors-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, token };
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

  it("paginates and filters vendors", async () => {
    const { org, token } = await seedOrg([Permissions.VENDOR_READ]);

    await prisma.vendor.createMany({
      data: [
        { orgId: org.id, name: "Alpha Supplies", email: "alpha@vendor.local", isActive: true },
        { orgId: org.id, name: "Beta Supplies", email: "beta@vendor.local", isActive: true },
        { orgId: org.id, name: "Zen Services", email: "zen@vendor.local", isActive: false },
      ],
    });

    const page1 = await request(app.getHttpServer())
      .get("/vendors?page=1&pageSize=2")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(page1.body.data.data).toHaveLength(2);
    expect(page1.body.data.pageInfo.total).toBe(3);

    const page2 = await request(app.getHttpServer())
      .get("/vendors?page=2&pageSize=2")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(page2.body.data.data).toHaveLength(1);

    const inactive = await request(app.getHttpServer())
      .get("/vendors?isActive=false")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(inactive.body.data.data).toHaveLength(1);

    const search = await request(app.getHttpServer())
      .get("/vendors?search=Zen")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(search.body.data.data).toHaveLength(1);
  });
});
