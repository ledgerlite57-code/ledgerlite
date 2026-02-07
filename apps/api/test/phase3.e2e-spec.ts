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

describe("Phase 3 (e2e)", () => {
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
    await prisma.openingInventoryDraftLine.deleteMany();
    await prisma.openingBalanceDraftLine.deleteMany();
    await prisma.openingBalanceDraftBatch.deleteMany();
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

  const seedOrg = async (permissions: string[], vatEnabled = true) => {
    if (permissions.length > 0) {
      await prisma.permission.createMany({
        data: permissions.map((code) => ({ code, description: code })),
        skipDuplicates: true,
      });
    }

    const org = await prisma.organization.create({
      data: { name: "Phase 3 Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled },
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
        paymentPrefix: "PAY-",
        paymentNextNumber: 1,
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
      data: { email: `phase3-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
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

  it("creates and updates a draft invoice", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.TAX_READ,
      Permissions.TAX_WRITE,
    ]);

    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4001",
        name: "Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5001",
        name: "Expenses",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme", isActive: true },
    });

    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Consulting",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode.id,
      },
    });

    const createRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "invoice-idem")
      .send({
        customerId: customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Consulting",
            qty: 2,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    expect(Number(createRes.body.data.subTotal)).toBe(200);
    expect(Number(createRes.body.data.taxTotal)).toBe(10);
    expect(Number(createRes.body.data.total)).toBe(210);

    const invoiceId = createRes.body.data.id as string;

    const updateRes = await request(app.getHttpServer())
      .patch(`/invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        lines: [
          {
            itemId: item.id,
            description: "Consulting",
            qty: 3,
            unitPrice: 100,
          },
        ],
      })
      .expect(200);

    expect(Number(updateRes.body.data.total)).toBe(315);

    const audits = await prisma.auditLog.findMany({
      where: { orgId: org.id, entityType: "INVOICE" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("posts an invoice and enforces idempotency", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.TAX_READ,
      Permissions.TAX_WRITE,
      Permissions.COA_READ,
    ]);

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
    const vatAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2100",
        name: "VAT Payable",
        type: "LIABILITY",
        subtype: "VAT_PAYABLE",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4000",
        name: "Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5000",
        name: "Expenses",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme", isActive: true },
    });
    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });
    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Service",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode.id,
      },
    });

    const invoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Service",
            qty: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "post-idem")
      .expect(201);

    expect(postRes.body.data.invoice.status).toBe("POSTED");
    expect(postRes.body.data.invoice.number).toMatch(/^INV-/);
    expect(postRes.body.data.glHeader).toBeTruthy();

    const secondRes = await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "post-idem")
      .expect(201);

    expect(secondRes.body.data.glHeader.id).toBe(postRes.body.data.glHeader.id);

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    const header = await prisma.gLHeader.findFirst({ where: { orgId: org.id, sourceId: invoiceId } });
    expect(header).toBeTruthy();

    const lines = await prisma.gLLine.findMany({ where: { headerId: header?.id } });
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(arAccount.id).toBeTruthy();
    expect(vatAccount.id).toBeTruthy();
  });

  it("blocks posting when VAT payable is missing", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.TAX_READ,
      Permissions.TAX_WRITE,
    ]);

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
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5000",
        name: "Expenses",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme", isActive: true },
    });
    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });
    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Service",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode.id,
      },
    });

    const invoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Service",
            qty: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});




