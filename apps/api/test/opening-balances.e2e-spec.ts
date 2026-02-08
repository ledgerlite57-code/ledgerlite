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

describe("Opening balances workflow (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  type SeededOrg = {
    token: string;
    orgId: string;
    cashAccountId: string;
    liabilityAccountId: string;
    inventoryAccountId: string;
    inventoryItemId: string;
  };

  const resetDb = async () => {
    await prisma.$transaction([
      prisma.openingInventoryDraftLine.deleteMany(),
      prisma.openingBalanceDraftLine.deleteMany(),
      prisma.openingBalanceDraftBatch.deleteMany(),
      prisma.gLLine.deleteMany(),
      prisma.gLHeader.deleteMany(),
      prisma.vendorPaymentAllocation.deleteMany(),
      prisma.vendorPayment.deleteMany(),
      prisma.billLine.deleteMany(),
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
      prisma.creditNoteRefund.deleteMany(),
      prisma.creditNote.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.purchaseOrderLine.deleteMany(),
      prisma.purchaseOrder.deleteMany(),
      prisma.expenseLine.deleteMany(),
      prisma.expense.deleteMany(),
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

  const seedOrg = async (): Promise<SeededOrg> => {
    await prisma.permission.createMany({
      data: [{ code: Permissions.ORG_WRITE, description: Permissions.ORG_WRITE }],
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "Opening Balance Org", baseCurrency: "AED", vatEnabled: false },
    });

    await prisma.orgSettings.create({
      data: { orgId: org.id },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.ORG_WRITE },
    });

    const user = await prisma.user.create({
      data: { email: `opening-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const cashAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1000",
        name: "Cash",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const liabilityAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2000",
        name: "Loan Payable",
        type: "LIABILITY",
        normalBalance: NormalBalance.CREDIT,
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

    const inventoryItem = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Widget",
        type: "INVENTORY",
        salePrice: 0,
        purchasePrice: 50,
        inventoryAccountId: inventoryAccount.id,
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
      cashAccountId: cashAccount.id,
      liabilityAccountId: liabilityAccount.id,
      inventoryAccountId: inventoryAccount.id,
      inventoryItemId: inventoryItem.id,
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

  it("previews and posts opening balances", async () => {
    const { token, orgId, cashAccountId, liabilityAccountId, inventoryItemId } = await seedOrg();

    await request(app.getHttpServer())
      .patch("/settings/opening-balances/cut-over")
      .set("Authorization", `Bearer ${token}`)
      .send({ cutOverDate: "2026-02-01" })
      .expect(200);

    await request(app.getHttpServer())
      .put("/settings/opening-balances/draft-lines")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lines: [
          { accountId: cashAccountId, debit: 1000 },
          { accountId: liabilityAccountId, credit: 600 },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .put("/settings/opening-balances/inventory")
      .set("Authorization", `Bearer ${token}`)
      .send({
        lines: [{ itemId: inventoryItemId, qty: 5, unitCost: 50 }],
      })
      .expect(200);

    const previewRes = await request(app.getHttpServer())
      .post("/settings/opening-balances/preview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const preview = previewRes.body?.data ?? previewRes.body;
    expect(preview.adjustmentLine).toBeTruthy();
    expect(preview.adjustmentLine.credit).toBe("650.00");

    const idempotencyKey = "opening-balance-post-key";
    const postRes = await request(app.getHttpServer())
      .post("/settings/opening-balances/post")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .expect(201);

    const postData = postRes.body?.data ?? postRes.body;
    expect(postData.status).toBe("POSTED");
    expect(postData.glHeader).toBeTruthy();

    const header = await prisma.gLHeader.findUnique({
      where: {
        orgId_sourceType_sourceId: {
          orgId,
          sourceType: "OPENING_BALANCE",
          sourceId: `OPENING_BALANCE:${orgId}`,
        },
      },
      include: { lines: true },
    });

    expect(header).toBeTruthy();
    expect(header?.lines.length).toBeGreaterThan(0);

    const repostRes = await request(app.getHttpServer())
      .post("/settings/opening-balances/post")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .expect(201);

    const repostData = repostRes.body?.data ?? repostRes.body;
    expect(repostData.glHeader?.id).toBe(postData.glHeader.id);

    await request(app.getHttpServer())
      .put("/settings/opening-balances/draft-lines")
      .set("Authorization", `Bearer ${token}`)
      .send({ lines: [{ accountId: cashAccountId, debit: 10 }] })
      .expect(409);
  });
});


