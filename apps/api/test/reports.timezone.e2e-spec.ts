import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Reports timezone consistency (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
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
    await prisma.creditNoteAllocation.deleteMany();
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
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  };

  const seedOrg = async () => {
    await prisma.permission.createMany({
      data: [{ code: Permissions.REPORTS_VIEW, description: Permissions.REPORTS_VIEW }],
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "TZ Org", baseCurrency: "AED", countryCode: "AE", timeZone: "UTC", vatEnabled: false },
    });

    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4000",
        name: "Sales",
        type: "INCOME",
        subtype: "SALES",
        normalBalance: "CREDIT",
        isActive: true,
      },
    });
    const offsetAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Cash",
        type: "ASSET",
        subtype: "CASH",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.REPORTS_VIEW },
    });

    const user = await prisma.user.create({
      data: { email: `tz-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return {
      token,
      orgId: org.id,
      userId: user.id,
      incomeAccountId: incomeAccount.id,
      offsetAccountId: offsetAccount.id,
    };
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

  it("applies UTC day boundaries for report ranges", async () => {
    const { token, orgId, userId, incomeAccountId, offsetAccountId } = await seedOrg();

    const inRangeDate = new Date("2026-01-01T23:30:00.000Z");
    const outOfRangeDate = new Date("2026-01-02T00:30:00.000Z");

    await prisma.gLHeader.create({
      data: {
        orgId,
        sourceType: "JOURNAL",
        sourceId: "TZ-IN",
        postingDate: inRangeDate,
        currency: "AED",
        exchangeRate: 1,
        totalDebit: 100,
        totalCredit: 100,
        status: "POSTED",
        memo: "In range",
        createdByUserId: userId,
        lines: {
          create: [
            {
              lineNo: 1,
              accountId: incomeAccountId,
              debit: 0,
              credit: 100,
              description: "In range",
            },
            {
              lineNo: 2,
              accountId: offsetAccountId,
              debit: 100,
              credit: 0,
              description: "In range offset",
            },
          ],
        },
      },
    });

    await prisma.gLHeader.create({
      data: {
        orgId,
        sourceType: "JOURNAL",
        sourceId: "TZ-OUT",
        postingDate: outOfRangeDate,
        currency: "AED",
        exchangeRate: 1,
        totalDebit: 200,
        totalCredit: 200,
        status: "POSTED",
        memo: "Out of range",
        createdByUserId: userId,
        lines: {
          create: [
            {
              lineNo: 1,
              accountId: incomeAccountId,
              debit: 0,
              credit: 200,
              description: "Out of range",
            },
            {
              lineNo: 2,
              accountId: offsetAccountId,
              debit: 200,
              credit: 0,
              description: "Out of range offset",
            },
          ],
        },
      },
    });

    const response = await request(app.getHttpServer())
      .get("/reports/profit-loss?from=2026-01-01&to=2026-01-01")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.income.total).toBe("100.00");
  });
});



