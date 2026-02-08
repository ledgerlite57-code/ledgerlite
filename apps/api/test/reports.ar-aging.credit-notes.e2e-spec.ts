import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import cookieParser from "cookie-parser";
import { NormalBalance } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("AR aging with credit notes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.creditNoteAllocation.deleteMany();
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
    await prisma.attachment.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  };

  const seedOrg = async () => {
    const permissionCodes = [
      Permissions.INVOICE_READ,
      Permissions.INVOICE_WRITE,
      Permissions.INVOICE_POST,
      Permissions.CUSTOMER_READ,
      Permissions.CUSTOMER_WRITE,
      Permissions.ITEM_READ,
      Permissions.ITEM_WRITE,
      Permissions.REPORTS_VIEW,
    ];

    await prisma.permission.createMany({
      data: permissionCodes.map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "AR Aging Org", baseCurrency: "AED", countryCode: "AE", timeZone: "UTC", vatEnabled: false },
    });

    await prisma.orgSettings.create({
      data: { orgId: org.id, reportBasis: "ACCRUAL", defaultVatBehavior: "EXCLUSIVE" },
    });

    const unit = await prisma.unitOfMeasure.create({
      data: { orgId: org.id, name: "Each", symbol: "ea", isActive: true },
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
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Consulting",
        type: "SERVICE",
        salePrice: 100,
        incomeAccountId: incomeAccount.id,
        unitOfMeasureId: unit.id,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme Co", isActive: true },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: permissionCodes.map((code) => ({ roleId: role.id, permissionCode: code })),
    });

    const user = await prisma.user.create({
      data: { email: `ar-aging-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { token, customerId: customer.id, itemId: item.id };
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

  it("reduces invoice outstanding by applied credit notes", async () => {
    const { token, customerId, itemId } = await seedOrg();

    const invoiceRes = await request(app.getHttpServer())
      .post("/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        invoiceDate: new Date().toISOString(),
        exchangeRate: 1,
        lines: [
          {
            itemId,
            description: "Consulting",
            qty: 1,
            unitPrice: 100,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const invoiceId = invoiceRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const creditNoteRes = await request(app.getHttpServer())
      .post("/credit-notes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId,
        invoiceId,
        creditNoteDate: new Date().toISOString(),
        exchangeRate: 1,
        lines: [
          {
            itemId,
            description: "Credit",
            qty: 1,
            unitPrice: 20,
            discountAmount: 0,
          },
        ],
      })
      .expect(201);

    const creditNoteId = creditNoteRes.body.data.id as string;

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/credit-notes/${creditNoteId}/apply`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        allocations: [{ invoiceId, amount: 20 }],
      })
      .expect(201);

    const asOf = new Date().toISOString().slice(0, 10);
    const aging = await request(app.getHttpServer())
      .get(`/reports/ar-aging?asOf=${asOf}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const customer = aging.body.data.customers[0];
    expect(customer.totals.current).toBe("80.00");
    expect(customer.lines[0].outstanding).toBe("80.00");
  });
});
