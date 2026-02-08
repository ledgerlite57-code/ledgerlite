import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance, Prisma, PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Balance sheet derived equity (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async (client: PrismaClient) => {
    await client.expenseLine.deleteMany();
    await client.expense.deleteMany();
    await client.savedView.deleteMany();
    await client.gLLine.deleteMany();
    await client.gLHeader.deleteMany();
    await client.vendorPaymentAllocation.deleteMany();
    await client.vendorPayment.deleteMany();
    await client.billLine.deleteMany();
    await client.bill.deleteMany();
    await client.paymentReceivedAllocation.deleteMany();
    await client.paymentReceived.deleteMany();
    await client.invoiceLine.deleteMany();
    await client.creditNoteAllocation.deleteMany();
    await client.invoice.deleteMany();
    await client.auditLog.deleteMany();
    await client.idempotencyKey.deleteMany();
    await client.invite.deleteMany();
    await client.inventoryMovement.deleteMany();
    await client.openingInventoryDraftLine.deleteMany();
    await client.openingBalanceDraftLine.deleteMany();
    await client.openingBalanceDraftBatch.deleteMany();
    await client.item.deleteMany();
    await client.taxCode.deleteMany();
    await client.creditNoteLine.deleteMany();
    await client.creditNoteRefund.deleteMany();
    await client.creditNote.deleteMany();
    await client.customer.deleteMany();
    await client.purchaseOrderLine.deleteMany();
    await client.purchaseOrder.deleteMany();
    await client.vendor.deleteMany();
    await client.rolePermission.deleteMany();
    await client.permission.deleteMany();
    await client.membership.deleteMany();
    await client.role.deleteMany();
    await client.reconciliationMatch.deleteMany();
    await client.reconciliationSession.deleteMany();
    await client.bankTransaction.deleteMany();
    await client.bankAccount.deleteMany();
    await client.account.deleteMany();
    await client.orgSettings.deleteMany();
    await client.refreshToken.deleteMany();
    await client.journalLine.deleteMany();
    await client.journalEntry.deleteMany();
    await client.attachment.deleteMany();
    await client.user.deleteMany();
    await client.organization.deleteMany();
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
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns derived equity and balances assets with liabilities + equity", async () => {
    await prisma.permission.create({
      data: { code: Permissions.REPORTS_VIEW, description: "REPORTS_VIEW" },
    });

    const org = await prisma.organization.create({
      data: { name: "Reports Org", baseCurrency: "AED", fiscalYearStartMonth: 1 },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.REPORTS_VIEW },
    });

    const user = await prisma.user.create({
      data: { email: "reports@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const assetAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const liabilityAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2000",
        name: "Accounts Payable",
        type: "LIABILITY",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "3000",
        name: "Owner Equity",
        type: "EQUITY",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4000",
        name: "Sales Revenue",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5000",
        name: "Office Expense",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const postingDate = new Date("2026-01-10T00:00:00.000Z");
    const header1 = await prisma.gLHeader.create({
      data: {
        orgId: org.id,
        sourceType: "JOURNAL",
        sourceId: "reports-1",
        postingDate,
        currency: "AED",
        totalDebit: new Prisma.Decimal(100),
        totalCredit: new Prisma.Decimal(100),
        createdByUserId: user.id,
      },
    });
    await prisma.gLLine.createMany({
      data: [
        {
          headerId: header1.id,
          lineNo: 1,
          accountId: assetAccount.id,
          debit: new Prisma.Decimal(100),
          credit: new Prisma.Decimal(0),
        },
        {
          headerId: header1.id,
          lineNo: 2,
          accountId: incomeAccount.id,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(100),
        },
      ],
    });

    const header2 = await prisma.gLHeader.create({
      data: {
        orgId: org.id,
        sourceType: "JOURNAL",
        sourceId: "reports-2",
        postingDate: new Date("2026-01-11T00:00:00.000Z"),
        currency: "AED",
        totalDebit: new Prisma.Decimal(30),
        totalCredit: new Prisma.Decimal(30),
        createdByUserId: user.id,
      },
    });
    await prisma.gLLine.createMany({
      data: [
        {
          headerId: header2.id,
          lineNo: 1,
          accountId: expenseAccount.id,
          debit: new Prisma.Decimal(30),
          credit: new Prisma.Decimal(0),
        },
        {
          headerId: header2.id,
          lineNo: 2,
          accountId: liabilityAccount.id,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(30),
        },
      ],
    });

    const asOf = new Date("2026-01-15T00:00:00.000Z").toISOString();
    const response = await request(app.getHttpServer())
      .get(`/reports/balance-sheet?asOf=${encodeURIComponent(asOf)}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const payload = response.body.data as {
      assets: { total: string };
      liabilities: { total: string };
      equity: { total: string; derived?: { netProfit: string; computedEquity: string } };
      totalLiabilitiesAndEquity: string;
    };

    expect(payload.assets.total).toBe("100.00");
    expect(payload.liabilities.total).toBe("30.00");
    expect(payload.equity.derived?.netProfit).toBe("70.00");
    expect(payload.equity.derived?.computedEquity).toBe("70.00");
    expect(payload.equity.total).toBe("70.00");
    expect(payload.totalLiabilitiesAndEquity).toBe("100.00");
  });
});






