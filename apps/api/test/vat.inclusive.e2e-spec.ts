import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("VAT inclusive behavior (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
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
    await prisma.inventoryMovement.deleteMany();
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
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  };

  const seedOrg = async () => {
    await prisma.permission.createMany({
      data: [{ code: Permissions.INVOICE_WRITE, description: Permissions.INVOICE_WRITE }],
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "VAT Inclusive Org", baseCurrency: "AED", countryCode: "AE", timeZone: "UTC", vatEnabled: true },
    });

    await prisma.orgSettings.create({
      data: { orgId: org.id, defaultVatBehavior: "INCLUSIVE" },
    });

    const unit = await prisma.unitOfMeasure.create({
      data: { orgId: org.id, name: "Each", symbol: "ea", isActive: true },
    });

    const incomeAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4000",
        name: "Sales",
        type: "INCOME",
        subtype: "SALES",
        normalBalance: "CREDIT",
        isActive: true,
      },
    });

    const expenseAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "5000",
        name: "Expense",
        type: "EXPENSE",
        subtype: "EXPENSE",
        normalBalance: "DEBIT",
        isActive: true,
      },
    });

    const taxCode = await prisma.taxCode.create({
      data: { orgId: org.id, name: "VAT 10%", rate: 10, type: "STANDARD", isActive: true },
    });

    const item = await prisma.item.create({
      data: {
        orgId: org.id,
        name: "Consulting",
        type: "SERVICE",
        salePrice: 110,
        incomeAccountId: incomeAccount.id,
        expenseAccountId: expenseAccount.id,
        unitOfMeasureId: unit.id,
        defaultTaxCodeId: taxCode.id,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Acme Co", isActive: true },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.INVOICE_WRITE },
    });

    const user = await prisma.user.create({
      data: { email: `vat-inclusive-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    return { token, customerId: customer.id, itemId: item.id, taxCodeId: taxCode.id };
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

  it("backs out tax for inclusive prices", async () => {
    const { token, customerId, itemId, taxCodeId } = await seedOrg();

    const response = await request(app.getHttpServer())
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
            unitPrice: 110,
            discountAmount: 0,
            taxCodeId,
          },
        ],
      })
      .expect(201);

    expect(Number(response.body.data.subTotal)).toBe(100);
    expect(Number(response.body.data.taxTotal)).toBe(10);
    expect(Number(response.body.data.total)).toBe(110);
  });
});



