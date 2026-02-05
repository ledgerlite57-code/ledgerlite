import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance, Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Numbering formats (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.reconciliationMatch.deleteMany();
    await prisma.reconciliationSession.deleteMany();
    await prisma.bankTransaction.deleteMany();
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
    await prisma.taxCode.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.vendor.deleteMany();
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

  const createAuthContext = async (permissions: string[]) => {
    await prisma.permission.createMany({
      data: permissions.map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "Numbering Org", baseCurrency: "AED", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((code) => ({ roleId: role.id, permissionCode: code })),
    });

    const user = await prisma.user.create({
      data: { email: "numbering@ledgerlite.local", passwordHash: "hash" },
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

  it("uses numberingFormats for invoice numbering even when legacy fields differ", async () => {
    const { org, user, token } = await createAuthContext([Permissions.INVOICE_POST]);

    const arAccount = await prisma.account.create({
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

    await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        invoicePrefix: "LEG-",
        invoiceNextNumber: 3,
        billPrefix: "BILL-",
        billNextNumber: 1,
        paymentPrefix: "PAY-",
        paymentNextNumber: 1,
        vendorPaymentPrefix: "VPAY-",
        vendorPaymentNextNumber: 1,
        numberingFormats: {
          invoice: { prefix: "NINV-", nextNumber: 10 },
        },
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Numbered Customer", isActive: true },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Service",
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
        status: "DRAFT",
        invoiceDate: new Date("2026-01-10T00:00:00.000Z"),
        dueDate: new Date("2026-01-10T00:00:00.000Z"),
        currency: "AED",
        exchangeRate: new Prisma.Decimal(1),
        subTotal: new Prisma.Decimal(100),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(100),
        createdByUserId: user.id,
        lines: {
          create: [
            {
              lineNo: 1,
              itemId: item.id,
              description: "Service",
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

    const response = await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const payload = response.body?.data ?? response.body;
    expect(payload.invoice.number).toBe("NINV-10");

    const settings = await prisma.orgSettings.findUnique({ where: { orgId: org.id } });
    const formats = settings?.numberingFormats as { invoice?: { prefix: string; nextNumber: number } } | null;
    expect(formats?.invoice?.prefix).toBe("NINV-");
    expect(formats?.invoice?.nextNumber).toBe(11);
    expect(settings?.invoicePrefix).toBe("NINV-");
    expect(settings?.invoiceNextNumber).toBe(11);
  });

  it("uses numberingFormats for bill system numbers", async () => {
    const { org, user, token } = await createAuthContext([Permissions.BILL_POST]);

    const apAccount = await prisma.account.create({
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

    await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        invoicePrefix: "INV-",
        invoiceNextNumber: 1,
        billPrefix: "LEG-",
        billNextNumber: 2,
        paymentPrefix: "PAY-",
        paymentNextNumber: 1,
        vendorPaymentPrefix: "VPAY-",
        vendorPaymentNextNumber: 1,
        numberingFormats: {
          bill: { prefix: "NBILL-", nextNumber: 5 },
        },
      },
    });

    const vendor = await prisma.vendor.create({
      data: { orgId: org.id, name: "Numbered Vendor", isActive: true },
    });

    const bill = await prisma.bill.create({
      data: {
        orgId: org.id,
        vendorId: vendor.id,
        status: "DRAFT",
        billDate: new Date("2026-01-10T00:00:00.000Z"),
        dueDate: new Date("2026-01-10T00:00:00.000Z"),
        currency: "AED",
        exchangeRate: new Prisma.Decimal(1),
        subTotal: new Prisma.Decimal(50),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(50),
        createdByUserId: user.id,
        lines: {
          create: [
            {
              lineNo: 1,
              expenseAccountId: expenseAccount.id,
              description: "Supplies",
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

    const response = await request(app.getHttpServer())
      .post(`/bills/${bill.id}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const payload = response.body?.data ?? response.body;
    expect(payload.bill.systemNumber).toBe("NBILL-5");

    const settings = await prisma.orgSettings.findUnique({ where: { orgId: org.id } });
    const formats = settings?.numberingFormats as { bill?: { prefix: string; nextNumber: number } } | null;
    expect(formats?.bill?.prefix).toBe("NBILL-");
    expect(formats?.bill?.nextNumber).toBe(6);
    expect(settings?.billPrefix).toBe("NBILL-");
    expect(settings?.billNextNumber).toBe(6);
  });
});


