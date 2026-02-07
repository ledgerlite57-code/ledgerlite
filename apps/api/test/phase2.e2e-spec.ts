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

describe("Phase 2 (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
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
      data: { name: "Phase 2 Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled },
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

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((code) => ({ roleId: role.id, permissionCode: code })),
      });
    }

    const user = await prisma.user.create({
      data: {
        email: `phase2-${Date.now()}-${Math.random().toString(16).slice(2)}@ledgerlite.local`,
        passwordHash: "hash",
      },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, role, user, membership, token };
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

  it("creates, searches, and deactivates customers and vendors", async () => {
    const { org, token } = await seedOrg([
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.VENDOR_READ,
      Permissions.VENDOR_WRITE,
    ]);

    const customerRes = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "customer-idem")
      .send({ name: "Acme Corp", email: "ap@acme.local", paymentTermsDays: 14 })
      .expect(201);

    const customerId = customerRes.body.data.id as string;
    expect(customerId).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);

    const customerList = await request(app.getHttpServer())
      .get("/customers?search=Acme&isActive=false")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(customerList.body.data.data).toHaveLength(1);

    const vendorRes = await request(app.getHttpServer())
      .post("/vendors")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Zen Supplies", email: "billing@zen.local" })
      .expect(201);

    const vendorId = vendorRes.body.data.id as string;
    expect(vendorId).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/vendors/${vendorId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);

    const vendorList = await request(app.getHttpServer())
      .get("/vendors?search=Zen&isActive=false")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(vendorList.body.data.data).toHaveLength(1);

    const auditLogs = await prisma.auditLog.findMany({
      where: { orgId: org.id, entityType: { in: ["CUSTOMER", "VENDOR"] } },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
  });

  it("blocks tax codes when VAT is disabled and supports idempotent create", async () => {
    const { token: disabledToken } = await seedOrg([Permissions.TAX_WRITE], false);

    await request(app.getHttpServer())
      .post("/tax-codes")
      .set("Authorization", `Bearer ${disabledToken}`)
      .send({ name: "VAT 5%", rate: 5, type: "STANDARD" })
      .expect(400);

    const { token } = await seedOrg([Permissions.TAX_WRITE, Permissions.TAX_READ], true);

    const first = await request(app.getHttpServer())
      .post("/tax-codes")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "tax-idem")
      .send({ name: "VAT 5%", rate: 5, type: "STANDARD" })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post("/tax-codes")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "tax-idem")
      .send({ name: "VAT 5%", rate: 5, type: "STANDARD" })
      .expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it("validates item account requirements and tax code usage", async () => {
    const { org, token } = await seedOrg([
      Permissions.ITEM_WRITE,
      Permissions.ITEM_READ,
      Permissions.TAX_WRITE,
      Permissions.TAX_READ,
    ]);

    const assetAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1001",
        name: "Cash",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
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
        name: "COGS",
        type: "EXPENSE",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const taxRes = await request(app.getHttpServer())
      .post("/tax-codes")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "VAT 5%", rate: 5, type: "STANDARD" })
      .expect(201);

    const taxCodeId = taxRes.body.data.id as string;

    await request(app.getHttpServer())
      .post("/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Invalid Item",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: assetAccount.id,
        expenseAccountId: expenseAccount.id,
      })
      .expect(400);

    const itemRes = await request(app.getHttpServer())
      .post("/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Consulting",
        type: "SERVICE",
        salePrice: 250,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCodeId,
      })
      .expect(201);

    expect(itemRes.body.data.id).toBeTruthy();
  });

  it("stores reorder point and opening quantity normalized to base UOM", async () => {
    const { org, token } = await seedOrg([Permissions.ITEM_WRITE, Permissions.ITEM_READ], true);

    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4100",
        name: "Services Income",
        type: "INCOME",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });

    const kilogram = await prisma.unitOfMeasure.create({
      data: {
        orgId: org.id,
        name: "Kilogram",
        symbol: "kg",
        baseUnitId: null,
        conversionRate: 1,
        isActive: true,
      },
    });
    const gram = await prisma.unitOfMeasure.create({
      data: {
        orgId: org.id,
        name: "Gram",
        symbol: "g",
        baseUnitId: kilogram.id,
        conversionRate: 0.001,
        isActive: true,
      },
    });

    const createRes = await request(app.getHttpServer())
      .post("/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Ground Spice",
        type: "SERVICE",
        salePrice: 4.5,
        purchasePrice: 2,
        incomeAccountId: incomeAccount.id,
        unitOfMeasureId: gram.id,
        reorderPoint: 500,
        openingQty: 2500,
      })
      .expect(201);

    const itemId = createRes.body.data.id as string;
    expect(itemId).toBeTruthy();
    expect(Number(createRes.body.data.reorderPoint)).toBeCloseTo(500, 4);
    expect(Number(createRes.body.data.openingQty)).toBeCloseTo(2500, 4);

    const stored = await prisma.item.findUnique({
      where: { id: itemId },
      select: { reorderPoint: true, openingQty: true },
    });
    expect(Number(stored?.reorderPoint ?? 0)).toBeCloseTo(0.5, 4);
    expect(Number(stored?.openingQty ?? 0)).toBeCloseTo(2.5, 4);

    const getRes = await request(app.getHttpServer())
      .get(`/items/${itemId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Number(getRes.body.data.reorderPoint)).toBeCloseTo(500, 4);
    expect(Number(getRes.body.data.openingQty)).toBeCloseTo(2500, 4);
  });
});




