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

describe("Pagination bank accounts (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNoteRefund.deleteMany();
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
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
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
      data: { name: "Pagination Bank Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: false },
    });

    const glAccount = await prisma.account.create({
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

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map((code) => ({ roleId: role.id, permissionCode: code })),
      });
    }

    const user = await prisma.user.create({
      data: { email: `banks-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, token, glAccount };
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

  it("paginates and filters bank accounts", async () => {
    const { org, token, glAccount } = await seedOrg([Permissions.BANK_READ]);

    await prisma.bankAccount.createMany({
      data: [
        {
          orgId: org.id,
          name: "Operating Bank",
          accountNumberMasked: "1111",
          currency: "AED",
          glAccountId: glAccount.id,
          isActive: true,
        },
        {
          orgId: org.id,
          name: "Payroll Bank",
          accountNumberMasked: "2222",
          currency: "AED",
          glAccountId: glAccount.id,
          isActive: true,
        },
        {
          orgId: org.id,
          name: "Archive Bank",
          accountNumberMasked: "3333",
          currency: "AED",
          glAccountId: glAccount.id,
          isActive: false,
        },
      ],
    });

    const active = await request(app.getHttpServer())
      .get("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(active.body.data.pageInfo.total).toBe(2);

    const all = await request(app.getHttpServer())
      .get("/bank-accounts?includeInactive=true")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(all.body.data.pageInfo.total).toBe(3);

    const page1 = await request(app.getHttpServer())
      .get("/bank-accounts?page=1&pageSize=2&includeInactive=true")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(page1.body.data.data).toHaveLength(2);

    const search = await request(app.getHttpServer())
      .get("/bank-accounts?search=Operating")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(search.body.data.data).toHaveLength(1);
  });
});




