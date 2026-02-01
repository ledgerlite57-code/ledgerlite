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

describe("Sidebar Counts (e2e)", () => {
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
      data: { name: "Sidebar Counts Org", baseCurrency: "AED", countryCode: "AE", timeZone: "Asia/Dubai" },
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
      data: { email: `sidebar-${Date.now()}@ledgerlite.local`, passwordHash: "hash" },
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

  it("returns draft counts only for permitted modules", async () => {
    const { org, user, token } = await seedOrg([Permissions.ORG_READ, Permissions.INVOICE_READ]);

    const customer = await prisma.customer.create({
      data: { orgId: org.id, name: "Sidebar Customer", isActive: true },
    });
    const vendor = await prisma.vendor.create({
      data: { orgId: org.id, name: "Sidebar Vendor", isActive: true },
    });

    await prisma.invoice.create({
      data: {
        orgId: org.id,
        customerId: customer.id,
        status: "DRAFT",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currency: "AED",
        subTotal: 100,
        taxTotal: 0,
        total: 100,
        createdByUserId: user.id,
      },
    });

    await prisma.bill.create({
      data: {
        orgId: org.id,
        vendorId: vendor.id,
        status: "DRAFT",
        billDate: new Date(),
        dueDate: new Date(),
        currency: "AED",
        subTotal: 50,
        taxTotal: 0,
        total: 50,
        createdByUserId: user.id,
      },
    });

    const response = await request(app.getHttpServer())
      .get("/orgs/sidebar-counts")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({ invoices: 1 });
  });
});



