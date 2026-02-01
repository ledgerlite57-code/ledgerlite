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

describe("Phase 4 (e2e)", () => {
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
    await prisma.invite.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.reconciliationMatch.deleteMany();
    await prisma.reconciliationSession.deleteMany();
    await prisma.bankTransaction.deleteMany();
    await prisma.bankAccount.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.item.deleteMany();
    await prisma.unitOfMeasure.deleteMany({ where: { baseUnitId: { not: null } } });
    await prisma.unitOfMeasure.deleteMany();
    await prisma.taxCode.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.vendor.deleteMany();
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
      data: { name: "Phase 4 Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai" },
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
      data: { email: `phase4-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { org, user, token };
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

  it("creates a payment draft with allocations", async () => {
    const { org, user, token } = await seedOrg([
      Permissions.PAYMENT_RECEIVED_READ,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.CUSTOMER_READ,
    ]);

    const arAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
      },
    });
    const bankGl = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: NormalBalance.DEBIT,
      },
    });
    const bankAccount = await prisma.bankAccount.create({
      data: { orgId: org.id, name: "Operating Bank", currency: "AED", glAccountId: bankGl.id, isActive: true },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme", isActive: true },
    });

    const invoice = await prisma.invoice.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        status: "POSTED",
        number: "INV-1",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currency: "AED",
        subTotal: 100,
        taxTotal: 0,
        total: 100,
        amountPaid: 0,
        paymentStatus: "UNPAID",
        createdByUserId: user.id,
        postedAt: new Date(),
      },
    });

    const response = await request(app.getHttpServer())
      .post("/payments-received")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "pay-idem")
      .send({
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        paymentDate: new Date().toISOString(),
        currency: "AED",
        allocations: [{ invoiceId: invoice.id, amount: 100 }],
      })
      .expect(201);

    expect(Number(response.body.data.amountTotal)).toBe(100);
    expect(response.body.data.customer.id).toBe(customer.id);
    expect(response.body.data.status).toBe("DRAFT");
    expect(arAccount.id).toBeTruthy();

    const audits = await prisma.auditLog.findMany({
      where: { orgId: org.id, entityType: "PAYMENT_RECEIVED" },
    });
    expect(audits.length).toBeGreaterThan(0);
  });

  it("posts a payment and updates invoice balances", async () => {
    const { org, user, token } = await seedOrg([
      Permissions.PAYMENT_RECEIVED_READ,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.PAYMENT_RECEIVED_POST,
      Permissions.CUSTOMER_READ,
    ]);

    const arAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: NormalBalance.DEBIT,
      },
    });
    const bankGl = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: NormalBalance.DEBIT,
      },
    });
    const bankAccount = await prisma.bankAccount.create({
      data: { orgId: org.id, name: "Operating Bank", currency: "AED", glAccountId: bankGl.id, isActive: true },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Globex", isActive: true },
    });

    const invoice = await prisma.invoice.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        status: "POSTED",
        number: "INV-2",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currency: "AED",
        subTotal: 200,
        taxTotal: 0,
        total: 200,
        amountPaid: 0,
        paymentStatus: "UNPAID",
        createdByUserId: user.id,
        postedAt: new Date(),
      },
    });

    const paymentRes = await request(app.getHttpServer())
      .post("/payments-received")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        paymentDate: new Date().toISOString(),
        currency: "AED",
        allocations: [{ invoiceId: invoice.id, amount: 200 }],
      })
      .expect(201);

    const paymentId = paymentRes.body.data.id as string;

    const postRes = await request(app.getHttpServer())
      .post(`/payments-received/${paymentId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "post-idem")
      .expect(201);

    expect(postRes.body.data.payment.status).toBe("POSTED");
    expect(postRes.body.data.payment.number).toMatch(/^PAY-/);

    const secondRes = await request(app.getHttpServer())
      .post(`/payments-received/${paymentId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "post-idem")
      .expect(201);

    expect(secondRes.body.data.glHeader.id).toBe(postRes.body.data.glHeader.id);

    await request(app.getHttpServer())
      .post(`/payments-received/${paymentId}/post`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(Number(updatedInvoice?.amountPaid ?? 0)).toBe(200);
    expect(updatedInvoice?.paymentStatus).toBe("PAID");

    const header = await prisma.gLHeader.findFirst({ where: { orgId: org.id, sourceId: paymentId } });
    expect(header).toBeTruthy();

    const lines = await prisma.gLLine.findMany({ where: { headerId: header?.id } });
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(arAccount.id).toBeTruthy();
  });

  it("blocks over-allocation against invoice outstanding", async () => {
    const { org, user, token } = await seedOrg([
      Permissions.PAYMENT_RECEIVED_READ,
      Permissions.PAYMENT_RECEIVED_WRITE,
      Permissions.CUSTOMER_READ,
    ]);

    const bankGl = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: NormalBalance.DEBIT,
      },
    });
    const bankAccount = await prisma.bankAccount.create({
      data: { orgId: org.id, name: "Operating Bank", currency: "AED", glAccountId: bankGl.id, isActive: true },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Overpay Co", isActive: true },
    });

    const invoice = await prisma.invoice.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        status: "POSTED",
        number: "INV-3",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currency: "AED",
        subTotal: 100,
        taxTotal: 0,
        total: 100,
        amountPaid: 90,
        paymentStatus: "PARTIAL",
        createdByUserId: user.id,
        postedAt: new Date(),
      },
    });

    await request(app.getHttpServer())
      .post("/payments-received")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        paymentDate: new Date().toISOString(),
        currency: "AED",
        allocations: [{ invoiceId: invoice.id, amount: 20 }],
      })
      .expect(400);
  });
});


