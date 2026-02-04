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

describe("Inventory tracking (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
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
    await prisma.item.deleteMany();
    await prisma.unitOfMeasure.deleteMany({ where: { baseUnitId: { not: null } } });
    await prisma.unitOfMeasure.deleteMany();
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

  const seedOrg = async (permissions: string[]) => {
    if (permissions.length > 0) {
      await prisma.permission.createMany({
        data: permissions.map((code) => ({ code, description: code })),
        skipDuplicates: true,
      });
    }

    const org = await prisma.organization.create({
      data: { name: "Inventory Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: false },
    });

    const baseUnit = await prisma.unitOfMeasure.create({
      data: {
        orgId: org.id,
        name: "Each",
        symbol: "ea",
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      },
    });

    await prisma.unitOfMeasure.create({
      data: {
        orgId: org.id,
        name: "Dozen",
        symbol: "doz",
        baseUnitId: baseUnit.id,
        conversionRate: 12,
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
      data: { email: `inventory-${Date.now()}-${Math.round(Math.random() * 1_000_000)}@ledgerlite.local`, passwordHash: "hash" },
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

  const seedInventoryInvoiceRefs = async (orgId: string) => {
    await prisma.account.create({
      data: {
        orgId,
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
        orgId,
        code: "4000",
        name: "Sales",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });

    const expenseAccount = await prisma.account.create({
      data: {
        orgId,
        code: "5000",
        name: "COGS",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const inventoryAccount = await prisma.account.create({
      data: {
        orgId,
        code: "1400",
        name: "Inventory Asset",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    await prisma.orgSettings.update({
      where: { orgId },
      data: { defaultInventoryAccountId: inventoryAccount.id },
    });

    const customer = await prisma.customer.create({
      data: { orgId, name: "Inventory Customer", isActive: true },
    });

    const baseUnit = await prisma.unitOfMeasure.findFirst({ where: { orgId, baseUnitId: null } });
    expect(baseUnit?.id).toBeTruthy();

    const item = await prisma.item.create({
      data: {
        orgId,
        name: "Widget",
        type: "INVENTORY",
        salePrice: 120,
        purchasePrice: 80,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        inventoryAccountId: inventoryAccount.id,
        unitOfMeasureId: baseUnit!.id,
        trackInventory: true,
        isActive: true,
      },
    });

    return { customer, item, inventoryAccount };
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

  it("records inventory movements for invoice and bill postings", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.BILL_READ,
      Permissions.BILL_WRITE,
      Permissions.BILL_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.VENDOR_READ,
      Permissions.VENDOR_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.COA_READ,
      Permissions.COA_WRITE,
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
    const apAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2100",
        name: "Accounts Payable",
        type: "LIABILITY",
        subtype: "AP",
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
        name: "COGS",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const inventoryAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1400",
        name: "Inventory Asset",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    await prisma.orgSettings.update({
      where: { orgId: org.id },
      data: { defaultInventoryAccountId: inventoryAccount.id },
    });
    expect(arAccount.id).toBeTruthy();
    expect(apAccount.id).toBeTruthy();

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Inventory Customer", isActive: true },
    });
    const vendor = await prisma.vendor.create({
      data: { orgId: org.id, name: "Inventory Vendor", isActive: true },
    });

    const baseUnit = await prisma.unitOfMeasure.findFirst({ where: { orgId: org.id, baseUnitId: null } });
    const dozenUnit = await prisma.unitOfMeasure.findFirst({ where: { orgId: org.id, name: "Dozen" } });
    expect(baseUnit?.id).toBeTruthy();
    expect(dozenUnit?.id).toBeTruthy();

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Widget",
        type: "INVENTORY",
        salePrice: 120,
        purchasePrice: 80,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        inventoryAccountId: inventoryAccount.id,
        unitOfMeasureId: baseUnit!.id,
        trackInventory: true,
        isActive: true,
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
            unitOfMeasureId: dozenUnit!.id,
            description: "Widgets",
            qty: 2,
            unitPrice: 120,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const invoiceMovements = await prisma.inventoryMovement.findMany({
      where: { orgId: org.id, sourceType: "INVOICE", sourceId: invoiceId },
    });
    expect(invoiceMovements.length).toBe(1);
    expect(Number(invoiceMovements[0].quantity)).toBe(-24);
    const invoiceHeader = await prisma.gLHeader.findFirst({
      where: { orgId: org.id, sourceType: "INVOICE", sourceId: invoiceId },
    });
    expect(invoiceHeader).toBeTruthy();
    const invoiceLines = await prisma.gLLine.findMany({ where: { headerId: invoiceHeader?.id } });
    expect(invoiceLines.some((line) => line.accountId === expenseAccount.id && Number(line.debit) > 0)).toBe(true);
    expect(invoiceLines.some((line) => line.accountId === inventoryAccount.id && Number(line.credit) > 0)).toBe(true);

    const billRes = await request(app.getHttpServer())
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId: vendor.id,
        billDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            expenseAccountId: inventoryAccount.id,
            itemId: item.id,
            description: "Widgets purchase",
            qty: 5,
            unitPrice: 4,
          },
        ],
      })
      .expect(201);

    const billId = billRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/bills/${billId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const billMovements = await prisma.inventoryMovement.findMany({
      where: { orgId: org.id, sourceType: "BILL", sourceId: billId },
    });
    expect(billMovements.length).toBe(1);
    expect(Number(billMovements[0].quantity)).toBe(5);
    expect(Number(billMovements[0].unitCost)).toBe(4);
    const billHeader = await prisma.gLHeader.findFirst({
      where: { orgId: org.id, sourceType: "BILL", sourceId: billId },
    });
    expect(billHeader).toBeTruthy();
    const billLines = await prisma.gLLine.findMany({ where: { headerId: billHeader?.id } });
    expect(billLines.some((line) => line.accountId === inventoryAccount.id && Number(line.debit) > 0)).toBe(true);
  });

  it("blocks invoice posting when negative stock policy is BLOCK", async () => {
    const { org, token } = await seedOrg([
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.COA_READ,
    ]);
    const { customer, item, inventoryAccount } = await seedInventoryInvoiceRefs(org.id);

    await prisma.orgSettings.update({
      where: { orgId: org.id },
      data: {
        negativeStockPolicy: "BLOCK",
        defaultInventoryAccountId: inventoryAccount.id,
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
            description: "Widgets",
            qty: 1,
            unitPrice: 120,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(postRes.body.error.message).toContain("negative stock");
    expect(postRes.body.error.details?.policy).toBe("BLOCK");
    expect(Array.isArray(postRes.body.error.details?.items)).toBe(true);
    expect(postRes.body.error.details.items).toHaveLength(1);
  });

  it("supports WARN mode and BLOCK override with permission + audit trail", async () => {
    const permissions = [
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.COA_READ,
      Permissions.INVENTORY_NEGATIVE_STOCK_OVERRIDE,
    ];

    const { org: warnOrg, token: warnToken } = await seedOrg(permissions);
    const warnRefs = await seedInventoryInvoiceRefs(warnOrg.id);
    await prisma.orgSettings.update({
      where: { orgId: warnOrg.id },
      data: {
        negativeStockPolicy: "WARN",
        defaultInventoryAccountId: warnRefs.inventoryAccount.id,
      },
    });

    const warnInvoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${warnToken}`)
      .send({
        customerId: warnRefs.customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: warnRefs.item.id,
            description: "Warn widgets",
            qty: 1,
            unitPrice: 120,
          },
        ],
      })
      .expect(201);

    const warnPostRes = await request(app.getHttpServer())
      .post(`/invoices/${warnInvoiceRes.body.data.id}/post`)
      .set("Authorization", `Bearer ${warnToken}`)
      .expect(201);

    expect(warnPostRes.body.data.warnings?.negativeStock?.policy).toBe("WARN");
    expect(warnPostRes.body.data.warnings?.negativeStock?.overrideApplied).toBe(false);
    expect(Array.isArray(warnPostRes.body.data.warnings?.negativeStock?.items)).toBe(true);
    expect(warnPostRes.body.data.warnings.negativeStock.items).toHaveLength(1);

    const { org: blockOrg, token: blockToken } = await seedOrg(permissions);
    const blockRefs = await seedInventoryInvoiceRefs(blockOrg.id);
    await prisma.orgSettings.update({
      where: { orgId: blockOrg.id },
      data: {
        negativeStockPolicy: "BLOCK",
        defaultInventoryAccountId: blockRefs.inventoryAccount.id,
      },
    });

    const blockInvoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${blockToken}`)
      .send({
        customerId: blockRefs.customer.id,
        invoiceDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            itemId: blockRefs.item.id,
            description: "Override widgets",
            qty: 1,
            unitPrice: 120,
          },
        ],
      })
      .expect(201);

    const overrideReason = "Urgent fulfillment with approved override";
    const overridePostRes = await request(app.getHttpServer())
      .post(`/invoices/${blockInvoiceRes.body.data.id}/post`)
      .set("Authorization", `Bearer ${blockToken}`)
      .send({
        negativeStockOverride: true,
        negativeStockOverrideReason: overrideReason,
      })
      .expect(201);

    expect(overridePostRes.body.data.warnings?.negativeStock?.policy).toBe("BLOCK");
    expect(overridePostRes.body.data.warnings?.negativeStock?.overrideApplied).toBe(true);
    expect(overridePostRes.body.data.warnings?.negativeStock?.overrideReason).toBe(overrideReason);

    const auditRow = await prisma.auditLog.findFirst({
      where: {
        orgId: blockOrg.id,
        entityType: "INVOICE",
        entityId: blockInvoiceRes.body.data.id as string,
        action: "POST",
      },
      orderBy: { createdAt: "desc" },
    });
    const after = (auditRow?.after ?? {}) as { negativeStockWarning?: { overrideApplied?: boolean; overrideReason?: string | null } };
    expect(after.negativeStockWarning?.overrideApplied).toBe(true);
    expect(after.negativeStockWarning?.overrideReason).toBe(overrideReason);
  });
});

