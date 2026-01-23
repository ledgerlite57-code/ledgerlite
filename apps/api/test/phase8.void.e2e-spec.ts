import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Phase 8 void workflow (e2e)", () => {
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
    await prisma.magicLinkToken.deleteMany();
    await prisma.invite.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.item.deleteMany();
    await prisma.taxCode.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.vendor.deleteMany();
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

  it("voids a posted invoice by creating a reversal GL header (idempotent)", async () => {
    await prisma.permission.create({
      data: { code: Permissions.INVOICE_POST, description: Permissions.INVOICE_POST },
    });

    const org = await prisma.organization.create({
      data: { name: "Void Org", baseCurrency: "AED", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.INVOICE_POST },
    });

    const user = await prisma.user.create({
      data: { email: "void@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    await prisma.account.create({
      data: { orgId: org.id, code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "AR", isActive: true },
    });

    const incomeAccount = await prisma.account.create({
      data: { orgId: org.id, code: "4000", name: "Sales", type: "INCOME", subtype: "SALES", isActive: true },
    });

    const expenseAccount = await prisma.account.create({
      data: { orgId: org.id, code: "5000", name: "Expense", type: "EXPENSE", subtype: "EXPENSE", isActive: true },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Void Customer", isActive: true },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Void Item",
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
        invoiceDate: new Date("2026-01-10T00:00:00.000Z"),
        dueDate: new Date("2026-01-10T00:00:00.000Z"),
        currency: "AED",
        subTotal: new Prisma.Decimal(100),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(100),
        createdByUserId: user.id,
        lines: {
          create: [
            {
              lineNo: 1,
              itemId: item.id,
              description: "Void test",
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

    const postRes = await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "post-void-1")
      .expect(201);

    expect(postRes.body.ok).toBe(true);

    const voidKey = "void-1";
    const voidRes = await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/void`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", voidKey)
      .expect(201);

    expect(voidRes.body.ok).toBe(true);
    expect(voidRes.body.data.invoice.status).toBe("VOID");
    expect(voidRes.body.data.reversalHeader).toBeTruthy();

    const reversalId = voidRes.body.data.reversalHeader.id;
    const originalHeader = await prisma.gLHeader.findUnique({
      where: {
        orgId_sourceType_sourceId: {
          orgId: org.id,
          sourceType: "INVOICE",
          sourceId: invoice.id,
        },
      },
    });

    expect(originalHeader?.status).toBe("REVERSED");
    expect(originalHeader?.reversedByHeaderId).toBe(reversalId);

    const voidResRepeat = await request(app.getHttpServer())
      .post(`/invoices/${invoice.id}/void`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", voidKey)
      .expect(201);

    expect(voidResRepeat.body.ok).toBe(true);
    expect(voidResRepeat.body.data.reversalHeader.id).toBe(reversalId);
  });
});
