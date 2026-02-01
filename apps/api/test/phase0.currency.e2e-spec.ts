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
import { ErrorCodes, Permissions } from "@ledgerlite/shared";

describe("Phase 0 currency guard (e2e)", () => {
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

  it("blocks posting invoices when currency differs from org base currency", async () => {
    await prisma.permission.create({
      data: { code: Permissions.INVOICE_POST, description: Permissions.INVOICE_POST },
    });

    const org = await prisma.organization.create({
      data: { name: "Currency Org", baseCurrency: "AED", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.INVOICE_POST },
    });

    const user = await prisma.user.create({
      data: { email: "currency@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

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

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme Corp", isActive: true },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Consulting",
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
        invoiceDate: new Date("2026-01-01T00:00:00.000Z"),
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
        currency: "USD",
        subTotal: new Prisma.Decimal(100),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(100),
        createdByUserId: user.id,
        lines: {
          create: [
            {
              lineNo: 1,
              itemId: item.id,
              description: "Consulting",
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

    const token = jwt.sign(
      {
        sub: user.id,
        orgId: org.id,
        membershipId: membership.id,
        roleId: role.id,
      },
      { secret: process.env.API_JWT_SECRET },
    );

    const response = await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe(ErrorCodes.MULTICURRENCY_NOT_SUPPORTED);
  });
});


