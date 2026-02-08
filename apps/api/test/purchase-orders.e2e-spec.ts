import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import cookieParser from "cookie-parser";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance } from "@prisma/client";
import { Permissions } from "@ledgerlite/shared";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";

describe("Purchase orders (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  type SeededContext = {
    token: string;
    orgId: string;
    vendorId: string;
    expenseAccountId: string;
    itemId: string;
    taxCodeId?: string;
  };

  type SeedOptions = {
    approvalThreshold?: number;
    vatEnabled?: boolean;
  };

  const resetDb = async () => {
    await prisma.$transaction([
      prisma.gLLine.deleteMany(),
      prisma.gLHeader.deleteMany(),
      prisma.vendorPaymentAllocation.deleteMany(),
      prisma.vendorPayment.deleteMany(),
      prisma.billLine.deleteMany(),
      prisma.purchaseOrderLine.deleteMany(),
      prisma.purchaseOrder.deleteMany(),
      prisma.bill.deleteMany(),
      prisma.paymentReceivedAllocation.deleteMany(),
      prisma.paymentReceived.deleteMany(),
      prisma.invoiceLine.deleteMany(),
      prisma.creditNoteAllocation.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.idempotencyKey.deleteMany(),
      prisma.invite.deleteMany(),
      prisma.rolePermission.deleteMany(),
      prisma.permission.deleteMany(),
      prisma.membership.deleteMany(),
      prisma.inventoryMovement.deleteMany(),
      prisma.openingInventoryDraftLine.deleteMany(),
      prisma.openingBalanceDraftLine.deleteMany(),
      prisma.openingBalanceDraftBatch.deleteMany(),
      prisma.item.deleteMany(),
      prisma.taxCode.deleteMany(),
      prisma.creditNoteLine.deleteMany(),
      prisma.creditNote.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.vendor.deleteMany(),
      prisma.reconciliationMatch.deleteMany(),
      prisma.reconciliationSession.deleteMany(),
      prisma.bankTransaction.deleteMany(),
      prisma.bankAccount.deleteMany(),
      prisma.account.deleteMany(),
      prisma.orgSettings.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.role.deleteMany(),
      prisma.journalLine.deleteMany(),
      prisma.journalEntry.deleteMany(),
      prisma.attachment.deleteMany(),
      prisma.user.deleteMany(),
      prisma.organization.deleteMany(),
    ]);
  };

  const seedContext = async (options?: SeedOptions): Promise<SeededContext> => {
    await prisma.permission.createMany({
      data: [
        { code: Permissions.ORG_READ, description: Permissions.ORG_READ },
        { code: Permissions.PURCHASE_ORDER_READ, description: Permissions.PURCHASE_ORDER_READ },
        { code: Permissions.PURCHASE_ORDER_WRITE, description: Permissions.PURCHASE_ORDER_WRITE },
        { code: Permissions.PURCHASE_ORDER_APPROVE, description: Permissions.PURCHASE_ORDER_APPROVE },
      ],
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "PO Org", baseCurrency: "AED", vatEnabled: options?.vatEnabled ?? false },
    });
    await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        purchaseOrderApprovalThreshold: options?.approvalThreshold ?? undefined,
      },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: role.id, permissionCode: Permissions.ORG_READ },
        { roleId: role.id, permissionCode: Permissions.PURCHASE_ORDER_READ },
        { roleId: role.id, permissionCode: Permissions.PURCHASE_ORDER_WRITE },
        { roleId: role.id, permissionCode: Permissions.PURCHASE_ORDER_APPROVE },
      ],
    });

    const user = await prisma.user.create({
      data: { email: `po-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });
    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "6000",
        name: "Purchase Expense",
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

    const vendor = await prisma.vendor.create({
      data: {
        orgId: org.id,
        name: "PO Vendor",
        email: "po-vendor@ledgerlite.local",
        isActive: true,
      },
    });

    const taxCode = org.vatEnabled
      ? await prisma.taxCode.create({
          data: {
            orgId: org.id,
            name: "VAT 5%",
            rate: 5,
            type: "STANDARD",
            isActive: true,
          },
        })
      : null;

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "PO Item",
        type: "INVENTORY",
        salePrice: 10,
        purchasePrice: 25,
        inventoryAccountId: inventoryAccount.id,
        expenseAccountId: expenseAccount.id,
        defaultTaxCodeId: taxCode?.id,
        trackInventory: true,
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

    return {
      token,
      orgId: org.id,
      vendorId: vendor.id,
      expenseAccountId: expenseAccount.id,
      itemId: item.id,
      taxCodeId: taxCode?.id ?? undefined,
    };
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

  it("supports draft -> sent -> partial receipt -> convert to bill with idempotency -> close", async () => {
    const { token, vendorId, expenseAccountId, itemId } = await seedContext();

    const createRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-02-10",
        currency: "AED",
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "Raw material",
            qty: 10,
            unitPrice: 25,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const created = createRes.body?.data ?? createRes.body;
    expect(created.id).toBeDefined();
    expect(created.status).toBe("DRAFT");
    expect(created.lines).toHaveLength(1);

    const poId = created.id as string;
    const lineId = created.lines[0].id as string;

    await request(app.getHttpServer())
      .get("/purchase-orders?status=DRAFT")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const sendRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect((sendRes.body?.data ?? sendRes.body).status).toBe("SENT");

    const receiveRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/receive`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        receiptDate: "2026-02-11",
        lines: [{ lineId, qty: 4 }],
      })
      .expect(201);

    const received = receiveRes.body?.data ?? receiveRes.body;
    expect(received.status).toBe("PARTIALLY_RECEIVED");
    expect(Number(received.lines[0].qtyReceived)).toBeCloseTo(4);

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        sourceType: "PURCHASE_ORDER_RECEIPT",
        sourceId: poId,
      },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].itemId).toBe(itemId);
    expect(Number(movements[0].quantity)).toBeCloseTo(4);

    const idempotencyKey = "po-convert-idempotency-key";
    const convertRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/convert-to-bill`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        billDate: "2026-02-12",
        basis: "RECEIVED",
      })
      .expect(201);
    const converted = convertRes.body?.data ?? convertRes.body;
    expect(converted.bill?.id).toBeDefined();

    const replayRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/convert-to-bill`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        billDate: "2026-02-12",
        basis: "RECEIVED",
      })
      .expect(201);
    const replay = replayRes.body?.data ?? replayRes.body;
    expect(replay.bill?.id).toBe(converted.bill.id);

    const detailRes = await request(app.getHttpServer())
      .get(`/purchase-orders/${poId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const detail = detailRes.body?.data ?? detailRes.body;
    expect(detail.bills).toHaveLength(1);
    expect(Number(detail.billedAmount)).toBeGreaterThan(0);
    expect(Number(detail.lines[0].qtyBilled)).toBeCloseTo(4);

    const closeRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/close`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect((closeRes.body?.data ?? closeRes.body).status).toBe("CLOSED");

    await request(app.getHttpServer())
      .patch(`/purchase-orders/${poId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reference: "no-edit-after-close" })
      .expect(409);
  });

  it("calculates tax totals from PO line tax codes", async () => {
    const { token, vendorId, expenseAccountId, itemId, taxCodeId } = await seedContext({ vatEnabled: true });
    expect(taxCodeId).toBeDefined();

    const createRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-03-01",
        currency: "AED",
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "Taxed material",
            qty: 2,
            unitPrice: 100,
            discountAmount: 0,
            taxCodeId,
          },
        ],
      })
      .expect(201);

    const created = createRes.body?.data ?? createRes.body;
    expect(Number(created.subTotal)).toBe(200);
    expect(Number(created.taxTotal)).toBe(10);
    expect(Number(created.total)).toBe(210);
    expect(Number(created.lines[0].lineTax)).toBe(10);
  });

  it("locks PO currency/rate after send and keeps the same values when converting to bill", async () => {
    const { token, vendorId, expenseAccountId, itemId } = await seedContext();

    const createRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-03-02",
        currency: "USD",
        exchangeRate: 3.67,
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "Imported part",
            qty: 5,
            unitPrice: 20,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const poId = (createRes.body?.data ?? createRes.body).id as string;
    const lineId = (createRes.body?.data ?? createRes.body).lines[0].id as string;

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/purchase-orders/${poId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ exchangeRate: 4.1 })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/receive`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        receiptDate: "2026-03-03",
        lines: [{ lineId, qty: 5 }],
      })
      .expect(201);

    const convertRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/convert-to-bill`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        billDate: "2026-03-04",
        basis: "RECEIVED",
      })
      .expect(201);

    const payload = convertRes.body?.data ?? convertRes.body;
    expect(payload.bill.currency).toBe("USD");
    expect(Number(payload.bill.exchangeRate)).toBeCloseTo(3.67, 6);
  });

  it("supports adding and listing attachments on a purchase order", async () => {
    const { token, vendorId, expenseAccountId, itemId } = await seedContext();

    const createPoRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-03-05",
        currency: "AED",
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "PO with quote",
            qty: 1,
            unitPrice: 250,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const poId = (createPoRes.body?.data ?? createPoRes.body).id as string;

    const attachmentRes = await request(app.getHttpServer())
      .post("/attachments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        entityType: "PURCHASE_ORDER",
        entityId: poId,
        fileName: "vendor-quote-link",
        mimeType: "text/uri-list",
        sizeBytes: 1,
        storageKey: "https://example.com/vendor-quote.pdf",
        description: "Vendor quote",
      })
      .expect(201);

    const attachment = attachmentRes.body?.data ?? attachmentRes.body;
    expect(attachment.entityType).toBe("PURCHASE_ORDER");
    expect(attachment.entityId).toBe(poId);

    const listRes = await request(app.getHttpServer())
      .get(`/attachments?entityType=PURCHASE_ORDER&entityId=${poId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const list = listRes.body?.data ?? listRes.body;
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(attachment.id);
  });

  it("writes audit records for core PO actions", async () => {
    const { token, vendorId, expenseAccountId, itemId, orgId } = await seedContext();

    const createRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-03-06",
        currency: "AED",
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "Audited PO",
            qty: 2,
            unitPrice: 50,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const po = createRes.body?.data ?? createRes.body;
    const poId = po.id as string;
    const lineId = po.lines[0].id as string;

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/receive`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        receiptDate: "2026-03-07",
        lines: [{ lineId, qty: 1 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const closeCreateRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-03-08",
        currency: "AED",
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "Close-only PO",
            qty: 1,
            unitPrice: 20,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const closePoId = (closeCreateRes.body?.data ?? closeCreateRes.body).id as string;
    await request(app.getHttpServer())
      .post(`/purchase-orders/${closePoId}/close`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const poLogs = await prisma.auditLog.findMany({
      where: { orgId, entityType: "PURCHASE_ORDER" },
      orderBy: { createdAt: "asc" },
    });

    const hasCreate = poLogs.some((log) => log.entityId === poId && log.action === "CREATE");
    const statusUpdates = poLogs
      .map((log) => (log.after as { status?: string } | null)?.status)
      .filter((status): status is string => Boolean(status));

    expect(hasCreate).toBe(true);
    expect(statusUpdates).toContain("SENT");
    expect(statusUpdates).toContain("PARTIALLY_RECEIVED");
    expect(statusUpdates).toContain("CANCELLED");
    expect(statusUpdates).toContain("CLOSED");
  });

  it("requires approval above threshold before sending", async () => {
    const { token, vendorId, expenseAccountId, itemId, orgId } = await seedContext({ approvalThreshold: 500 });

    const createRes = await request(app.getHttpServer())
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId,
        poDate: "2026-02-10",
        currency: "AED",
        lines: [
          {
            expenseAccountId,
            itemId,
            description: "High value raw material",
            qty: 25,
            unitPrice: 30,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const created = createRes.body?.data ?? createRes.body;
    expect(created.status).toBe("DRAFT");
    const poId = created.id as string;

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    const pendingRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/request-approval`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect((pendingRes.body?.data ?? pendingRes.body).status).toBe("PENDING_APPROVAL");

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    const rejectRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Need revised quantity" })
      .expect(201);
    expect((rejectRes.body?.data ?? rejectRes.body).status).toBe("DRAFT");

    await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/request-approval`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const approveRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect((approveRes.body?.data ?? approveRes.body).status).toBe("APPROVED");

    const sendRes = await request(app.getHttpServer())
      .post(`/purchase-orders/${poId}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect((sendRes.body?.data ?? sendRes.body).status).toBe("SENT");

    const auditEntries = await prisma.auditLog.findMany({
      where: { orgId, entityType: "PURCHASE_ORDER", entityId: poId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEntries.some((entry) => (entry.after as { event?: string } | null)?.event === "REQUEST_APPROVAL")).toBe(
      true,
    );
    expect(auditEntries.some((entry) => (entry.after as { event?: string } | null)?.event === "APPROVE")).toBe(true);
    expect(auditEntries.some((entry) => (entry.after as { event?: string } | null)?.event === "REJECT")).toBe(true);
  });
});
