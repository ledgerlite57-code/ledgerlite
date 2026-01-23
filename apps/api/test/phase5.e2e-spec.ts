import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Phase 5 (e2e)", () => {
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
    await prisma.unitOfMeasure.deleteMany({ where: { baseUnitId: { not: null } } });
    await prisma.unitOfMeasure.deleteMany();
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

  const seedOrg = async (permissions: string[]) => {
    if (permissions.length > 0) {
      await prisma.permission.createMany({
        data: permissions.map((code) => ({ code, description: code })),
        skipDuplicates: true,
      });
    }

    const org = await prisma.organization.create({
      data: { name: "Phase 5 Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai", vatEnabled: true },
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
      data: { email: `phase5-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
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

  it("creates a bill draft with VAT totals", async () => {
    const { org, token } = await seedOrg([Permissions.BILL_READ, Permissions.BILL_WRITE, Permissions.BILL_POST]);

    const expenseAccount = await prisma.account.create({
      data: { orgId: org.id, code: "5001", name: "Office Expenses", type: "EXPENSE", subtype: "EXPENSE", isActive: true },
    });
    await prisma.account.create({
      data: { orgId: org.id, code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "AP", isActive: true },
    });
    await prisma.account.create({
      data: { orgId: org.id, code: "1200", name: "VAT Receivable", type: "ASSET", subtype: "VAT_RECEIVABLE", isActive: true },
    });

    const vendor = await prisma.vendor.create({
      data: { orgId: org.id, name: "Paper Co", isActive: true },
    });

    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });

    const createRes = await request(app.getHttpServer())
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "bill-idem")
      .send({
        vendorId: vendor.id,
        billDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            expenseAccountId: expenseAccount.id,
            description: "Office chairs",
            qty: 2,
            unitPrice: 100,
            taxCodeId: taxCode.id,
          },
        ],
      })
      .expect(201);

    expect(createRes.body.data.status).toBe("DRAFT");
    expect(Number(createRes.body.data.subTotal)).toBe(200);
    expect(Number(createRes.body.data.taxTotal)).toBe(10);
    expect(Number(createRes.body.data.total)).toBe(210);
  });

  it("posts a bill and writes AP + VAT ledger entries", async () => {
    const { org, token } = await seedOrg([Permissions.BILL_READ, Permissions.BILL_WRITE, Permissions.BILL_POST]);

    const expenseAccount = await prisma.account.create({
      data: { orgId: org.id, code: "5002", name: "Utilities Expense", type: "EXPENSE", subtype: "EXPENSE", isActive: true },
    });
    const apAccount = await prisma.account.create({
      data: { orgId: org.id, code: "2001", name: "Accounts Payable", type: "LIABILITY", subtype: "AP", isActive: true },
    });
    const vatAccount = await prisma.account.create({
      data: { orgId: org.id, code: "1201", name: "VAT Receivable", type: "ASSET", subtype: "VAT_RECEIVABLE", isActive: true },
    });

    const vendor = await prisma.vendor.create({
      data: { orgId: org.id, name: "Utility Supplier", isActive: true },
    });

    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 5%", rate: 5, type: "STANDARD", isActive: true },
    });

    const billRes = await request(app.getHttpServer())
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vendorId: vendor.id,
        billDate: new Date().toISOString(),
        currency: "AED",
        lines: [
          {
            expenseAccountId: expenseAccount.id,
            description: "Utility bill",
            qty: 1,
            unitPrice: 200,
            taxCodeId: taxCode.id,
          },
        ],
      })
      .expect(201);

    const billId = billRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/bills/${billId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "bill-post-idem")
      .expect(201);

    expect(postRes.body.data.bill.status).toBe("POSTED");
    expect(postRes.body.data.bill.systemNumber).toMatch(/^BILL-/);

    const lines = postRes.body.data.glHeader.lines as Array<{
      accountId: string;
      debit: string;
      credit: string;
    }>;

    const expenseLine = lines.find((line) => line.accountId === expenseAccount.id);
    const vatLine = lines.find((line) => line.accountId === vatAccount.id);
    const apLine = lines.find((line) => line.accountId === apAccount.id);

    expect(Number(expenseLine?.debit ?? 0)).toBe(200);
    expect(Number(vatLine?.debit ?? 0)).toBe(10);
    expect(Number(apLine?.credit ?? 0)).toBe(210);

    const secondRes = await request(app.getHttpServer())
      .post(`/bills/${billId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "bill-post-idem")
      .expect(201);

    expect(secondRes.body.data.glHeader.id).toBe(postRes.body.data.glHeader.id);
  });

  it("returns standardized errors with hints", async () => {
    const { token } = await seedOrg([Permissions.BILL_READ, Permissions.BILL_WRITE]);

    const response = await request(app.getHttpServer())
      .post("/bills")
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error?.code).toBe("VALIDATION_ERROR");
    expect(typeof response.body.error?.message).toBe("string");
    expect(typeof response.body.error?.hint).toBe("string");
  });
});
