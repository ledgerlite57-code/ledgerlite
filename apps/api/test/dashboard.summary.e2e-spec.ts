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

describe("Dashboard summary (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async (client: PrismaClient) => {
    await client.expenseLine.deleteMany();
    await client.expense.deleteMany();
    await client.gLLine.deleteMany();
    await client.gLHeader.deleteMany();
    await client.vendorPaymentAllocation.deleteMany();
    await client.vendorPayment.deleteMany();
    await client.billLine.deleteMany();
    await client.bill.deleteMany();
    await client.paymentReceivedAllocation.deleteMany();
    await client.paymentReceived.deleteMany();
    await client.invoiceLine.deleteMany();
    await client.invoice.deleteMany();
    await client.auditLog.deleteMany();
    await client.idempotencyKey.deleteMany();
    await client.invite.deleteMany();
    await client.inventoryMovement.deleteMany();
    await client.item.deleteMany();
    await client.taxCode.deleteMany();
    await client.creditNoteLine.deleteMany();
    await client.creditNote.deleteMany();
    await client.customer.deleteMany();
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

  it("returns bank balances and profit totals for the range", async () => {
    await prisma.permission.create({
      data: { code: Permissions.ORG_READ, description: "ORG_READ" },
    });

    const org = await prisma.organization.create({
      data: { name: "Dashboard Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.ORG_READ },
    });

    const user = await prisma.user.create({
      data: { email: "dashboard@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const bankGlAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Bank - AED",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: NormalBalance.DEBIT,
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

    await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        name: "Main Bank",
        currency: "AED",
        glAccountId: bankGlAccount.id,
        openingBalance: new Prisma.Decimal(100),
      },
    });

    const postingDate = new Date();
    const revenueHeader = await prisma.gLHeader.create({
      data: {
        orgId: org.id,
        sourceType: "JOURNAL",
        sourceId: "dash-revenue",
        postingDate,
        currency: "AED",
        totalDebit: new Prisma.Decimal(200),
        totalCredit: new Prisma.Decimal(200),
        createdByUserId: user.id,
      },
    });
    await prisma.gLLine.createMany({
      data: [
        {
          headerId: revenueHeader.id,
          lineNo: 1,
          accountId: bankGlAccount.id,
          debit: new Prisma.Decimal(200),
          credit: new Prisma.Decimal(0),
        },
        {
          headerId: revenueHeader.id,
          lineNo: 2,
          accountId: incomeAccount.id,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(200),
        },
      ],
    });

    const expenseHeader = await prisma.gLHeader.create({
      data: {
        orgId: org.id,
        sourceType: "JOURNAL",
        sourceId: "dash-expense",
        postingDate,
        currency: "AED",
        totalDebit: new Prisma.Decimal(50),
        totalCredit: new Prisma.Decimal(50),
        createdByUserId: user.id,
      },
    });
    await prisma.gLLine.createMany({
      data: [
        {
          headerId: expenseHeader.id,
          lineNo: 1,
          accountId: expenseAccount.id,
          debit: new Prisma.Decimal(50),
          credit: new Prisma.Decimal(0),
        },
        {
          headerId: expenseHeader.id,
          lineNo: 2,
          accountId: bankGlAccount.id,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(50),
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get("/dashboard/summary?range=month-to-date")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const payload = response.body.data as {
      bankBalances: Array<{ balance: string }>;
      cashBalance: string;
      salesTotal: string;
      expenseTotal: string;
      netProfit: string;
    };

    expect(payload.bankBalances[0]?.balance).toBe("250.00");
    expect(payload.cashBalance).toBe("250.00");
    expect(payload.salesTotal).toBe("200.00");
    expect(payload.expenseTotal).toBe("50.00");
    expect(payload.netProfit).toBe("150.00");
  });
});



