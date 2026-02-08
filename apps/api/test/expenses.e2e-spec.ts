import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Expenses (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.inventoryMovement.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.savedView.deleteMany();
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
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
    await prisma.openingInventoryDraftLine.deleteMany();
    await prisma.openingBalanceDraftLine.deleteMany();
    await prisma.openingBalanceDraftBatch.deleteMany();
    await prisma.item.deleteMany();
    await prisma.unitOfMeasure.deleteMany({ where: { baseUnitId: { not: null } } });
    await prisma.unitOfMeasure.deleteMany();
    await prisma.taxCode.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.purchaseOrderLine.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.vendor.deleteMany();
    await prisma.reconciliationMatch.deleteMany();
    await prisma.reconciliationSession.deleteMany();
    await prisma.bankTransaction.deleteMany();
    await prisma.bankAccount.deleteMany();
    await prisma.account.deleteMany();
    await prisma.orgSettings.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.role.deleteMany();
    await prisma.attachment.deleteMany();
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
      data: { name: "Expenses Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: false },
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

    await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        invoicePrefix: "INV-",
        invoiceNextNumber: 1,
        billPrefix: "BILL-",
        billNextNumber: 1,
        expensePrefix: "EXP-",
        expenseNextNumber: 1,
        paymentPrefix: "PAY-",
        paymentNextNumber: 1,
        vendorPaymentPrefix: "VPAY-",
        vendorPaymentNextNumber: 1,
      },
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
      data: { email: `expenses-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
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

  it("creates and posts a pay-now expense", async () => {
    const { org, token } = await seedOrg([
      Permissions.EXPENSE_READ,
      Permissions.EXPENSE_WRITE,
      Permissions.EXPENSE_POST,
    ]);

    const bankGl = await prisma.account.create({
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
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5100",
        name: "Office Supplies",
        type: "EXPENSE",
        subtype: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        name: "Operating Bank",
        currency: "AED",
        glAccountId: bankGl.id,
        isActive: true,
      },
    });

    await prisma.vendor.create({
      data: { orgId: org.id, name: "Local Supplier", isActive: true },
    });

    const createRes = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bankAccountId: bankAccount.id,
        expenseDate: new Date().toISOString(),
        currency: "AED",
        exchangeRate: 1,
        reference: "Fuel receipt",
        lines: [
          {
            expenseAccountId: expenseAccount.id,
            description: "Fuel",
            qty: 1,
            unitPrice: 120,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const expenseId = createRes.body.data.id as string;
    expect(createRes.body.data.status).toBe("DRAFT");

    const postRes = await request(app.getHttpServer())
      .post(`/expenses/${expenseId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "expense-post-1")
      .expect(201);

    expect(postRes.body.data.expense.status).toBe("POSTED");
    expect(postRes.body.data.expense.number).toBeTruthy();

    const glHeader = await prisma.gLHeader.findFirst({
      where: { orgId: org.id, sourceType: "EXPENSE", sourceId: expenseId },
      include: { lines: true },
    });

    expect(glHeader).toBeTruthy();
    expect(glHeader?.lines.length).toBeGreaterThanOrEqual(2);

    const bankLine = glHeader?.lines.find((line) => line.accountId === bankGl.id && Number(line.credit) > 0);
    const expenseLine = glHeader?.lines.find((line) => line.accountId === expenseAccount.id && Number(line.debit) > 0);

    expect(bankLine).toBeTruthy();
    expect(expenseLine).toBeTruthy();
  });

  it("allows CASH paid-from account without bank account record", async () => {
    const { org, token } = await seedOrg([
      Permissions.EXPENSE_READ,
      Permissions.EXPENSE_WRITE,
      Permissions.EXPENSE_POST,
    ]);

    const cashAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1000",
        name: "Cash on Hand",
        type: "ASSET",
        subtype: "CASH",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5100",
        name: "Office Supplies",
        type: "EXPENSE",
        subtype: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const createRes = await request(app.getHttpServer())
      .post("/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        paymentAccountId: cashAccount.id,
        expenseDate: new Date().toISOString(),
        currency: "AED",
        exchangeRate: 1,
        reference: "Cash receipt",
        lines: [
          {
            expenseAccountId: expenseAccount.id,
            description: "Stationery",
            qty: 1,
            unitPrice: 75,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const expenseId = createRes.body.data.id as string;
    expect(expenseId).toBeTruthy();

    const storedDraft = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { bankAccountId: true, paymentAccountId: true },
    });
    expect(storedDraft?.bankAccountId).toBeNull();
    expect(storedDraft?.paymentAccountId).toBe(cashAccount.id);

    await request(app.getHttpServer())
      .post(`/expenses/${expenseId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "expense-post-cash-1")
      .expect(201);

    const glHeader = await prisma.gLHeader.findFirst({
      where: { orgId: org.id, sourceType: "EXPENSE", sourceId: expenseId },
      include: { lines: true },
    });

    expect(glHeader).toBeTruthy();
    const cashCredit = glHeader?.lines.find((line) => line.accountId === cashAccount.id && Number(line.credit) > 0);
    expect(cashCredit).toBeTruthy();
  });
});

