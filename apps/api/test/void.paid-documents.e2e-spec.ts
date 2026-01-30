import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance, Prisma, PaymentStatus } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Void paid documents (e2e)", () => {
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
    await prisma.item.deleteMany();
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

  const createAuthContext = async (permission: string) => {
    await prisma.permission.create({ data: { code: permission, description: permission } });

    const org = await prisma.organization.create({
      data: { name: "Void Paid Org", baseCurrency: "AED", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: permission },
    });

    const user = await prisma.user.create({
      data: { email: "void-paid@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      {
        sub: user.id,
        orgId: org.id,
        membershipId: membership.id,
        roleId: role.id,
      },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, user, token };
  };

  it("blocks voiding a paid invoice", async () => {
    const { org, user, token } = await createAuthContext(Permissions.INVOICE_POST);

    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4000",
        name: "Sales",
        type: "INCOME",
        subtype: "SALES",
        normalBalance: NormalBalance.CREDIT,
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
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const bankGlAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        name: "Operating Bank",
        currency: "AED",
        glAccountId: bankGlAccount.id,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Paid Customer", isActive: true },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Paid Item",
        type: "SERVICE",
        salePrice: new Prisma.Decimal(100),
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        isActive: true,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        status: "POSTED",
        paymentStatus: PaymentStatus.PARTIAL,
        amountPaid: new Prisma.Decimal(10),
        invoiceDate: new Date("2026-01-10T00:00:00.000Z"),
        dueDate: new Date("2026-01-10T00:00:00.000Z"),
        currency: "AED",
        subTotal: new Prisma.Decimal(100),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(100),
        postedAt: new Date("2026-01-11T00:00:00.000Z"),
        createdByUserId: user.id,
        lines: {
          create: [
            {
              lineNo: 1,
              itemId: item.id,
              description: "Paid invoice line",
              qty: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(100),
              discountAmount: new Prisma.Decimal(0),
              lineSubTotal: new Prisma.Decimal(100),
              lineTax: new Prisma.Decimal(0),
              lineTotal: new Prisma.Decimal(100),
            },
          ],
        },
      },
    });

    const payment = await prisma.paymentReceived.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        status: "POSTED",
        paymentDate: new Date("2026-01-12T00:00:00.000Z"),
        currency: "AED",
        amountTotal: new Prisma.Decimal(10),
        createdByUserId: user.id,
        allocations: {
          create: [
            {
              invoiceId: invoice.id,
              amount: new Prisma.Decimal(10),
            },
          ],
        },
      },
    });

    expect(payment).toBeTruthy();

    const response = await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body?.ok).toBe(false);
  });

  it("blocks voiding a paid bill", async () => {
    const { org, user, token } = await createAuthContext(Permissions.BILL_POST);

    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2000",
        name: "Accounts Payable",
        type: "LIABILITY",
        subtype: "AP",
        normalBalance: NormalBalance.CREDIT,
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
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const bankGlAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        name: "Operating Bank",
        currency: "AED",
        glAccountId: bankGlAccount.id,
        isActive: true,
      },
    });

    const vendor = await prisma.vendor.create({
      data: { orgId: org.id, name: "Paid Vendor", isActive: true },
    });

    const bill = await prisma.bill.create({
      data: {
        orgId: org.id,
        vendorId: vendor.id,
        status: "POSTED",
        paymentStatus: PaymentStatus.PARTIAL,
        amountPaid: new Prisma.Decimal(15),
        billDate: new Date("2026-01-10T00:00:00.000Z"),
        dueDate: new Date("2026-01-10T00:00:00.000Z"),
        currency: "AED",
        subTotal: new Prisma.Decimal(50),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(50),
        postedAt: new Date("2026-01-11T00:00:00.000Z"),
        createdByUserId: user.id,
        lines: {
          create: [
            {
              lineNo: 1,
              expenseAccountId: expenseAccount.id,
              description: "Paid bill line",
              qty: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(50),
              discountAmount: new Prisma.Decimal(0),
              lineSubTotal: new Prisma.Decimal(50),
              lineTax: new Prisma.Decimal(0),
              lineTotal: new Prisma.Decimal(50),
            },
          ],
        },
      },
    });

    const payment = await prisma.vendorPayment.create({
      data: {
        orgId: org.id,
        vendorId: vendor.id,
        bankAccountId: bankAccount.id,
        status: "POSTED",
        paymentDate: new Date("2026-01-12T00:00:00.000Z"),
        currency: "AED",
        amountTotal: new Prisma.Decimal(15),
        createdByUserId: user.id,
        allocations: {
          create: [
            {
              billId: bill.id,
              amount: new Prisma.Decimal(15),
            },
          ],
        },
      },
    });

    expect(payment).toBeTruthy();

    const response = await request(app.getHttpServer())
      .post(`/bills/${bill.id}/void`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body?.ok).toBe(false);
  });
});

