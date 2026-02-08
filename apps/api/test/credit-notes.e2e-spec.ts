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

describe("Credit notes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.savedView.deleteMany();
    await prisma.gLLine.deleteMany();
    await prisma.gLHeader.deleteMany();
    await prisma.vendorPaymentAllocation.deleteMany();
    await prisma.vendorPayment.deleteMany();
    await prisma.billLine.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.paymentReceivedAllocation.deleteMany();
    await prisma.paymentReceived.deleteMany();
    await prisma.creditNoteAllocation.deleteMany();
    await prisma.creditNoteRefund.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.invoiceLine.deleteMany();
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
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
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
      data: { name: "Credit Note Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: true },
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
      data: { email: `credit-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, token, user };
  };

  const seedInventoryCreditNoteRefs = async (orgId: string) => {
    const arAccount = await prisma.account.create({
      data: {
        orgId,
        code: "1109",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const incomeAccount = await prisma.account.create({
      data: {
        orgId,
        code: "4099",
        name: "Inventory Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });

    const expenseAccount = await prisma.account.create({
      data: {
        orgId,
        code: "5099",
        name: "COGS",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const inventoryAccount = await prisma.account.create({
      data: {
        orgId,
        code: "1499",
        name: "Inventory Asset",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    await prisma.orgSettings.update({
      where: { orgId },
      data: {
        defaultInventoryAccountId: inventoryAccount.id,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId, name: "Inventory Credit Customer", isActive: true },
    });

    const baseUnit = await prisma.unitOfMeasure.findFirst({ where: { orgId, baseUnitId: null } });
    expect(baseUnit?.id).toBeTruthy();

    const item = await prisma.item.create({
      data: {
        orgId,
        name: "Inventory Widget",
        type: "INVENTORY",
        salePrice: 20,
        purchasePrice: 10,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        inventoryAccountId: inventoryAccount.id,
        unitOfMeasureId: baseUnit!.id,
        trackInventory: true,
        isActive: true,
      },
    });

    return { arAccount, incomeAccount, expenseAccount, inventoryAccount, customer, item };
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

  it("creates and updates a draft credit note", async () => {
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
        name: "Service",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode.id,
      },
    });

    const createRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Service credit",
            qty: 2,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    expect(Number(createRes.body.data.subTotal)).toBe(200);
    expect(Number(createRes.body.data.taxTotal)).toBe(10);
    expect(Number(createRes.body.data.total)).toBe(210);

    const creditNoteId = createRes.body.data.id as string;

    const updateRes = await request(app.getHttpServer())
      .patch(`/credit-notes/${creditNoteId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        lines: [
          {
            itemId: item.id,
            description: "Service credit",
            qty: 3,
            unitPrice: 100,
          },
        ],
      })
      .expect(200);

    expect(Number(updateRes.body.data.total)).toBe(315);

    const audits = await prisma.auditLog.findMany({
      where: { orgId: org.id, entityType: "CREDIT_NOTE" },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("posts and voids a credit note", async () => {
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
    await prisma.account.create({
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

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Service credit",
            qty: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    const creditNoteId = creditRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(postRes.body.data.creditNote.status).toBe("POSTED");
    expect(postRes.body.data.creditNote.number).toMatch(/^CRN-/);
    expect(postRes.body.data.glHeader).toBeTruthy();

    const voidRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/void`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(voidRes.body.data.creditNote.status).toBe("VOID");
    expect(voidRes.body.data.reversalHeader).toBeTruthy();
  });

  it("refunds a posted credit note and writes ledger + audit records", async () => {
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
      Permissions.COA_WRITE,
      Permissions.BANK_READ,
    ]);

    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1101",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2101",
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
    const cashAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1001",
        name: "Cash on hand",
        type: "ASSET",
        subtype: "CASH",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Refund Customer", isActive: true },
    });
    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });
    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Refundable service",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode.id,
      },
    });

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Service credit",
            qty: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    const creditNoteId = creditRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const refundRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/refund`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "credit-note-refund-1")
      .send({
        paymentAccountId: cashAccount.id,
        refundDate: new Date().toISOString(),
        amount: 50,
      })
      .expect(201);

    expect(Number(refundRes.body.data.refund.amount)).toBe(50);
    expect(Number(refundRes.body.data.totals.refunded)).toBe(50);
    expect(Number(refundRes.body.data.totals.remaining)).toBe(55);
    expect(refundRes.body.data.glHeader).toBeTruthy();

    const glLines = await prisma.gLLine.findMany({
      where: { headerId: refundRes.body.data.glHeader.id },
      orderBy: { lineNo: "asc" },
    });
    expect(glLines).toHaveLength(2);
    expect(glLines[0]?.accountId).toBeDefined();
    expect(Number(glLines[0]?.debit ?? 0)).toBe(50);
    expect(Number(glLines[1]?.credit ?? 0)).toBe(50);

    const audit = await prisma.auditLog.findFirst({
      where: { orgId: org.id, entityType: "CREDIT_NOTE_REFUND", entityId: refundRes.body.data.refund.id },
    });
    expect(audit).toBeTruthy();

    const detailRes = await request(app.getHttpServer())
      .get(`/credit-notes/${creditNoteId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detailRes.body.data.refunds).toHaveLength(1);
  });

  it("rejects refunds above available credit balance", async () => {
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
      Permissions.COA_WRITE,
    ]);

    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1102",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2102",
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
        code: "4002",
        name: "Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5002",
        name: "Expenses",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const cashAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1002",
        name: "Cash Float",
        type: "ASSET",
        subtype: "CASH",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Balance Customer", isActive: true },
    });
    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });
    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Refund check service",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode.id,
      },
    });

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Service credit",
            qty: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);

    const creditNoteId = creditRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/refund`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        paymentAccountId: cashAccount.id,
        refundDate: new Date().toISOString(),
        amount: 1000,
      })
      .expect(400);
  });

  it("posts financial-only credit notes without inventory restock movements", async () => {
    const { org, token, user } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.COA_READ,
      Permissions.COA_WRITE,
    ]);

    const refs = await seedInventoryCreditNoteRefs(org.id);

    await prisma.inventoryMovement.create({
      data: {
        orgId: org.id,
        itemId: refs.item.id,
        quantity: 12,
        unitCost: 10,
        sourceType: "ADJUSTMENT",
        sourceId: `seed-${Date.now()}`,
        createdByUserId: user.id,
        effectiveAt: new Date(),
      },
    });

    const invoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: refs.customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: refs.item.id,
            description: "Inventory sale",
            qty: 6,
            unitPrice: 20,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const invoiceLine = await prisma.invoiceLine.findFirst({
      where: { invoiceId },
      select: { id: true },
    });
    expect(invoiceLine?.id).toBeTruthy();

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: refs.customer.id,
        invoiceId,
        returnInventory: false,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: refs.item.id,
            sourceInvoiceLineId: invoiceLine?.id,
            description: "Price-only adjustment",
            qty: 2,
            unitPrice: 20,
          },
        ],
      })
      .expect(201);

    const creditNoteId = creditRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    expect(postRes.body.data.creditNote.returnInventory).toBe(false);

    const creditMovements = await prisma.inventoryMovement.findMany({
      where: { orgId: org.id, sourceType: "CREDIT_NOTE", sourceId: creditNoteId },
    });
    expect(creditMovements).toHaveLength(0);

    const glLines = await prisma.gLLine.findMany({
      where: { headerId: postRes.body.data.glHeader.id as string },
    });
    expect(glLines.some((line) => line.accountId === refs.arAccount.id)).toBe(true);
    expect(glLines.some((line) => line.accountId === refs.incomeAccount.id)).toBe(true);
    expect(glLines.some((line) => line.accountId === refs.inventoryAccount.id)).toBe(false);
    expect(glLines.some((line) => line.accountId === refs.expenseAccount.id)).toBe(false);
  });

  it("uses invoice unit-cost snapshot for credit-note inventory returns", async () => {
    const { org, token, user } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.COA_READ,
      Permissions.COA_WRITE,
    ]);

    const refs = await seedInventoryCreditNoteRefs(org.id);

    await prisma.inventoryMovement.create({
      data: {
        orgId: org.id,
        itemId: refs.item.id,
        quantity: 24,
        unitCost: 10,
        sourceType: "ADJUSTMENT",
        sourceId: `seed-${Date.now()}`,
        createdByUserId: user.id,
        effectiveAt: new Date(),
      },
    });

    const invoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: refs.customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: refs.item.id,
            description: "Inventory sale",
            qty: 6,
            unitPrice: 20,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const invoiceLine = await prisma.invoiceLine.findFirst({
      where: { invoiceId },
      select: { id: true, inventoryUnitCost: true },
    });
    expect(Number(invoiceLine?.inventoryUnitCost ?? 0)).toBe(10);

    await prisma.item.update({
      where: { id: refs.item.id },
      data: { purchasePrice: 99 },
    });

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: refs.customer.id,
        invoiceId,
        returnInventory: true,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: refs.item.id,
            sourceInvoiceLineId: invoiceLine?.id,
            description: "Returned goods",
            qty: 2,
            unitPrice: 20,
          },
        ],
      })
      .expect(201);

    const creditNoteId = creditRes.body.data.id as string;
    const postRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const creditMovement = await prisma.inventoryMovement.findFirst({
      where: { orgId: org.id, sourceType: "CREDIT_NOTE", sourceId: creditNoteId },
      orderBy: { createdAt: "desc" },
    });
    expect(Number(creditMovement?.unitCost ?? 0)).toBe(10);

    const glLines = await prisma.gLLine.findMany({
      where: { headerId: postRes.body.data.glHeader.id as string },
    });
    const cogsReversal = glLines.find((line) => line.accountId === refs.expenseAccount.id);
    const inventoryReturn = glLines.find((line) => line.accountId === refs.inventoryAccount.id);
    expect(Number(cogsReversal?.credit ?? 0)).toBe(20);
    expect(Number(inventoryReturn?.debit ?? 0)).toBe(20);
  });

  it("requires refund flow when linked invoice is fully paid", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.PAYMENT_RECEIVED_READ,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.PAYMENT_RECEIVED_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.TAX_READ,
      Permissions.TAX_WRITE,
      Permissions.COA_READ,
      Permissions.COA_WRITE,
      Permissions.BANK_READ,
    ]);

    const arAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1110",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2110",
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
        code: "4010",
        name: "Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5010",
        name: "Expenses",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const cashAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Cash",
        type: "ASSET",
        subtype: "CASH",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Fully Paid Customer", isActive: true },
    });
    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });
    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Paid service",
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
            description: "Paid sale",
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
      .expect(201);

    const paymentDraft = await request(app.getHttpServer())
      .post("/payments-received")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        paymentDate: new Date().toISOString(),
        currency: "AED",
        depositAccountId: cashAccount.id,
        allocations: [{ invoiceId, amount: 105 }],
      })
      .expect(201);
    const paymentId = paymentDraft.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/payments-received/${paymentId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const fullyPaidInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { total: true, amountPaid: true },
    });
    expect(Number(fullyPaidInvoice?.amountPaid ?? 0)).toBe(Number(fullyPaidInvoice?.total ?? 0));

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        invoiceId,
        returnInventory: false,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Credit after payment",
            qty: 1,
            unitPrice: 100,
          },
        ],
      })
      .expect(201);
    const creditNoteId = creditRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ allocations: [{ invoiceId, amount: 105 }] })
      .expect(400);

    const refundRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/refund`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        paymentAccountId: cashAccount.id,
        refundDate: new Date().toISOString(),
        amount: 105,
      })
      .expect(201);

    expect(Number(refundRes.body.data.totals.remaining)).toBe(0);
    const refundLines = await prisma.gLLine.findMany({
      where: { headerId: refundRes.body.data.glHeader.id as string },
      orderBy: { lineNo: "asc" },
    });
    expect(refundLines).toHaveLength(2);
    expect(refundLines.some((line) => line.accountId === arAccount.id && Number(line.debit) === 105)).toBe(true);
    expect(refundLines.some((line) => line.accountId === cashAccount.id && Number(line.credit) === 105)).toBe(true);
  });

  it("supports VAT-inclusive partial credit note settlement via apply + refund", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.PAYMENT_RECEIVED_READ,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.PAYMENT_RECEIVED_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.TAX_READ,
      Permissions.TAX_WRITE,
      Permissions.COA_READ,
      Permissions.COA_WRITE,
      Permissions.BANK_READ,
    ]);

    await prisma.orgSettings.update({
      where: { orgId: org.id },
      data: { defaultVatBehavior: "INCLUSIVE" },
    });

    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1111",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2111",
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
        code: "4011",
        name: "Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });
    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5011",
        name: "Expenses",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const cashAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1011",
        name: "Cash",
        type: "ASSET",
        subtype: "CASH",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Inclusive Customer", isActive: true },
    });
    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 10%", rate: 10, type: "STANDARD", isActive: true },
    });
    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Inclusive service",
        type: "SERVICE",
        salePrice: 110,
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
            description: "Inclusive sale",
            qty: 2,
            unitPrice: 110,
          },
        ],
      })
      .expect(201);
    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const creditRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        invoiceId,
        returnInventory: false,
        creditNoteDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: item.id,
            description: "Partial inclusive credit",
            qty: 1,
            unitPrice: 110,
          },
        ],
      })
      .expect(201);
    expect(Number(creditRes.body.data.subTotal)).toBe(100);
    expect(Number(creditRes.body.data.taxTotal)).toBe(10);
    expect(Number(creditRes.body.data.total)).toBe(110);
    const creditNoteId = creditRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({ allocations: [{ invoiceId, amount: 60 }] })
      .expect(201);

    const refundRes = await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/refund`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        paymentAccountId: cashAccount.id,
        refundDate: new Date().toISOString(),
        amount: 50,
      })
      .expect(201);

    expect(Number(refundRes.body.data.totals.total)).toBe(110);
    expect(Number(refundRes.body.data.totals.applied)).toBe(60);
    expect(Number(refundRes.body.data.totals.refunded)).toBe(50);
    expect(Number(refundRes.body.data.totals.remaining)).toBe(0);

    const invoiceAfterApply = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { amountPaid: true, paymentStatus: true },
    });
    expect(Number(invoiceAfterApply?.amountPaid ?? 0)).toBe(60);
    expect(invoiceAfterApply?.paymentStatus).toBe("PARTIAL");
  });
});


