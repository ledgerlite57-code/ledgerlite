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

describe("Cash basis reports (e2e)", () => {
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
    await prisma.magicLinkToken.deleteMany();
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

  const seedOrg = async () => {
    const permissionCodes = [
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.PAYMENT_RECEIVED_POST,
      Permissions.REPORTS_VIEW,
    ];

    await prisma.permission.createMany({
      data: permissionCodes.map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "Cash Basis Org", baseCurrency: "AED", countryCode: "AE", timeZone: "UTC", vatEnabled: false },
    });

    await prisma.orgSettings.create({
      data: { orgId: org.id, reportBasis: "CASH", defaultVatBehavior: "EXCLUSIVE" },
    });

    const unit = await prisma.unitOfMeasure.create({
      data: { orgId: org.id, name: "Each", symbol: "ea", isActive: true },
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

    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5000",
        name: "Expense",
        type: "EXPENSE",
        subtype: "EXPENSE",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });

    const arAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });

    const bankAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1000",
        name: "Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Consulting",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        unitOfMeasureId: unit.id,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme Co", isActive: true },
    });

    const bank = await prisma.bankAccount.create({
      data: { orgId: org.id, name: "Main Bank", currency: "AED", glAccountId: bankAccount.id, isActive: true },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: permissionCodes.map((code) => ({ roleId: role.id, permissionCode: code })),
    });

    const user = await prisma.user.create({
      data: { email: `cash-basis-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { token, customerId: customer.id, itemId: item.id, bankAccountId: bank.id, arAccountId: arAccount.id };
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

  it("recognizes revenue on cash basis only after payment", async () => {
    const { token, customerId, itemId, bankAccountId } = await seedOrg();

    const invoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        invoiceDate: new Date().toISOString(),
        exchangeRate: 1,
        lines: [
          {
            itemId,
            description: "Consulting",
            qty: 1,
            unitPrice: 100,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const pnlBefore = await request(app.getHttpServer())
      .get(`/reports/profit-loss?from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(pnlBefore.body.data.income.total).toBe("0.00");

    const paymentRes = await request(app.getHttpServer())
      .post("/payments-received")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        bankAccountId,
        paymentDate: new Date().toISOString(),
        exchangeRate: 1,
        allocations: [{ invoiceId, amount: 100 }],
      })
      .expect(201);

    const paymentId = paymentRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/payments-received/${paymentId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const pnlAfter = await request(app.getHttpServer())
      .get(`/reports/profit-loss?from=${today}&to=${today}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(pnlAfter.body.data.income.total).toBe("100.00");
    expect(pnlAfter.body.data.netProfit).toBe("100.00");
  });
});

