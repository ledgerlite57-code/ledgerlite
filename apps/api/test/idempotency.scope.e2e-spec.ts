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

describe("Idempotency scope (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.reconciliationMatch.deleteMany();
    await prisma.reconciliationSession.deleteMany();
    await prisma.bankTransaction.deleteMany();
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
    await prisma.openingInventoryDraftLine.deleteMany();
    await prisma.openingBalanceDraftLine.deleteMany();
    await prisma.openingBalanceDraftBatch.deleteMany();
    await prisma.item.deleteMany();
    await prisma.taxCode.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.purchaseOrderLine.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.vendor.deleteMany();
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

  it("scopes idempotency by route and canonicalizes payloads", async () => {
    await prisma.permission.createMany({
      data: [
        { code: Permissions.CUSTOMER_WRITE, description: Permissions.CUSTOMER_WRITE },
        { code: Permissions.VENDOR_WRITE, description: Permissions.VENDOR_WRITE },
      ],
    });

    const org = await prisma.organization.create({
      data: { name: "Idempotency Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: [
        { roleId: role.id, permissionCode: Permissions.CUSTOMER_WRITE },
        { roleId: role.id, permissionCode: Permissions.VENDOR_WRITE },
      ],
    });

    const user = await prisma.user.create({
      data: { email: "idem@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
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

    const idempotencyKey = "idem-key-1";

    const firstCustomer = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({ name: "Alpha Co", email: "alpha@ledgerlite.local" })
      .expect(201);

    const firstCustomerData = firstCustomer.body?.data ?? firstCustomer.body;

    const secondCustomer = await request(app.getHttpServer())
      .post("/customers")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({ email: "alpha@ledgerlite.local", name: "Alpha Co" })
      .expect(201);

    const secondCustomerData = secondCustomer.body?.data ?? secondCustomer.body;

    expect(secondCustomerData.id).toBe(firstCustomerData.id);

    const vendorResponse = await request(app.getHttpServer())
      .post("/vendors")
      .set("Authorization", `Bearer ${token}`)
      .set("idempotency-key", idempotencyKey)
      .send({ name: "Bravo Supplies", email: "bravo@ledgerlite.local" })
      .expect(201);

    const vendorData = vendorResponse.body?.data ?? vendorResponse.body;
    expect(vendorData.id).toBeDefined();
  });
});



