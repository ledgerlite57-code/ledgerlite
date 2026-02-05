import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance, Prisma, PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Phase 1 rules (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const resetDb = async (client: PrismaClient) => {
    await client.expenseLine.deleteMany();
    await client.expense.deleteMany();
    await client.savedView.deleteMany();
    await client.gLLine.deleteMany();
    await client.gLHeader.deleteMany();
    await client.vendorPaymentAllocation.deleteMany();
    await client.vendorPayment.deleteMany();
    await client.billLine.deleteMany();
    await client.bill.deleteMany();
    await client.paymentReceivedAllocation.deleteMany();
    await client.paymentReceived.deleteMany();
    await client.invoiceLine.deleteMany();
    await client.invoice.deleteMany();
    await client.auditLog.deleteMany();
    await client.idempotencyKey.deleteMany();
    await client.invite.deleteMany();
    await client.inventoryMovement.deleteMany();
    await client.item.deleteMany();
    await client.taxCode.deleteMany();
    await client.creditNoteLine.deleteMany();
    await client.creditNote.deleteMany();
    await client.customer.deleteMany();
    await client.vendor.deleteMany();
    await client.rolePermission.deleteMany();
    await client.permission.deleteMany();
    await client.membership.deleteMany();
    await client.role.deleteMany();
    await client.reconciliationMatch.deleteMany();
    await client.reconciliationSession.deleteMany();
    await client.bankTransaction.deleteMany();
    await client.bankAccount.deleteMany();
    await client.account.deleteMany();
    await client.orgSettings.deleteMany();
    await client.refreshToken.deleteMany();
    await client.journalLine.deleteMany();
    await client.journalEntry.deleteMany();
    await client.user.deleteMany();
    await client.organization.deleteMany();
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
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows bootstrap org creation without membership", async () => {
    await prisma.user.create({
      data: {
        email: "bootstrap@ledgerlite.local",
        passwordHash: await argon2.hash("Password123!"),
      },
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "bootstrap@ledgerlite.local", password: "Password123!" })
      .expect(201);

    const accessToken = login.body.data.accessToken as string;
    expect(accessToken).toBeTruthy();

    const orgResponse = await request(app.getHttpServer())
      .post("/orgs")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", "bootstrap-org-key")
      .send({
        name: "Bootstrap Org",
        legalName: "Bootstrap Org LLC",
        tradeLicenseNumber: "TL-123456",
        address: {
          line1: "Sheikh Zayed Road",
          city: "Dubai",
          country: "AE",
        },
        phone: "+971500000000",
        industryType: "Services",
        defaultLanguage: "en-US",
        dateFormat: "DD/MM/YYYY",
        numberFormat: "1,234.56",
        countryCode: "AE",
        baseCurrency: "AED",
        fiscalYearStartMonth: 1,
        vatEnabled: true,
        vatTrn: "123456789012345",
        timeZone: "Asia/Dubai",
      })
      .expect(201);

    const createdOrgId = orgResponse.body.data.org.id as string;
    expect(createdOrgId).toBeTruthy();

    const accounts = await prisma.account.findMany({ where: { orgId: createdOrgId } });
    expect(accounts.length).toBeGreaterThan(0);
    const codes = new Set(accounts.map((account) => account.code));
    expect(codes.has("1200")).toBe(true);
    expect(codes.has("2100")).toBe(true);

    const ownerMembership = await prisma.membership.findFirst({
      where: { orgId: createdOrgId },
      include: { role: true },
    });
    expect(ownerMembership?.role?.name).toBe("Owner");

    const auditLog = await prisma.auditLog.findFirst({
      where: { orgId: createdOrgId, entityType: "ORG" },
    });
    expect(auditLog).toBeTruthy();
  });

  it("allows bootstrap org creation without idempotency header", async () => {
    await prisma.user.create({
      data: {
        email: "bootstrap-no-idem@ledgerlite.local",
        passwordHash: await argon2.hash("Password123!"),
      },
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "bootstrap-no-idem@ledgerlite.local", password: "Password123!" })
      .expect(201);

    const accessToken = login.body.data.accessToken as string;
    expect(accessToken).toBeTruthy();

    const orgResponse = await request(app.getHttpServer())
      .post("/orgs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Bootstrap Org No Header",
        legalName: "Bootstrap Org No Header LLC",
        tradeLicenseNumber: "TL-654321",
        address: {
          line1: "Al Wasl Road",
          city: "Dubai",
          country: "AE",
        },
        phone: "+971500000009",
        industryType: "Services",
        defaultLanguage: "en-US",
        dateFormat: "DD/MM/YYYY",
        numberFormat: "1,234.56",
        countryCode: "AE",
        baseCurrency: "AED",
        fiscalYearStartMonth: 1,
        vatEnabled: false,
        timeZone: "Asia/Dubai",
      })
      .expect(201);

    expect(orgResponse.body.data.org.id).toBeTruthy();
    expect(orgResponse.body.data.accessToken).toBeTruthy();
  });

  it("rejects org creation when required fields are missing", async () => {
    await prisma.user.create({
      data: {
        email: "missing-fields@ledgerlite.local",
        passwordHash: await argon2.hash("Password123!"),
      },
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "missing-fields@ledgerlite.local", password: "Password123!" })
      .expect(201);

    const accessToken = login.body.data.accessToken as string;
    expect(accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post("/orgs")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Idempotency-Key", "missing-fields-key")
      .send({
        name: "Incomplete Org",
        fiscalYearStartMonth: 1,
        vatEnabled: false,
      })
      .expect(400);
  });

  it("rejects duplicate account codes on update", async () => {
    await prisma.permission.create({
      data: { code: Permissions.COA_WRITE, description: "COA_WRITE" },
    });

    const org = await prisma.organization.create({
      data: { name: "Accounts Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.COA_WRITE },
    });

    const user = await prisma.user.create({
      data: { email: "accounts@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const accountA = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1000",
        name: "Cash",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });
    const accountB = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2000",
        name: "Bank",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
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

    await request(app.getHttpServer())
      .patch(`/accounts/${accountB.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ code: accountA.code })
      .expect(409);
  });

  it("enforces system account constraints", async () => {
    await prisma.permission.create({
      data: { code: Permissions.COA_WRITE, description: "COA_WRITE" },
    });

    const org = await prisma.organization.create({
      data: { name: "System Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.COA_WRITE },
    });

    const user = await prisma.user.create({
      data: { email: "system@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const account = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1000",
        name: "Cash",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isSystem: true,
        isActive: true,
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

    await request(app.getHttpServer())
      .patch(`/accounts/${account.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "LIABILITY" })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/accounts/${account.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false })
      .expect(409);
  });

  it("blocks deactivation when account is used in GL", async () => {
    await prisma.permission.create({
      data: { code: Permissions.COA_WRITE, description: "COA_WRITE" },
    });

    const org = await prisma.organization.create({
      data: { name: "GL Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.COA_WRITE },
    });

    const user = await prisma.user.create({
      data: { email: "gl@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const account = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "3000",
        name: "AR",
        type: "ASSET",
        normalBalance: NormalBalance.DEBIT,
        isActive: true,
      },
    });

    const header = await prisma.gLHeader.create({
      data: {
        orgId: org.id,
        sourceType: "JOURNAL",
        sourceId: "seed-1",
        postingDate: new Date(),
        currency: "AED",
        totalDebit: new Prisma.Decimal(100),
        totalCredit: new Prisma.Decimal(100),
        createdByUserId: user.id,
      },
    });

    await prisma.gLLine.create({
      data: {
        headerId: header.id,
        lineNo: 1,
        accountId: account.id,
        debit: new Prisma.Decimal(100),
        credit: new Prisma.Decimal(0),
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

    await request(app.getHttpServer())
      .patch(`/accounts/${account.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false })
      .expect(409);
  });

  it("rejects duplicate account codes on create", async () => {
    await prisma.permission.create({
      data: { code: Permissions.COA_WRITE, description: "COA_WRITE" },
    });

    const org = await prisma.organization.create({
      data: { name: "Duplicate Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.COA_WRITE },
    });

    const user = await prisma.user.create({
      data: { email: "dup@ledgerlite.local", passwordHash: "hash" },
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

    const payload = { code: "9999", name: "Dup Account", type: "ASSET" };
    await request(app.getHttpServer())
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(409);
  });

  it("replays idempotent account and invite creation", async () => {
    await prisma.permission.createMany({
      data: [
        { code: Permissions.COA_WRITE, description: "COA_WRITE" },
        { code: Permissions.USER_INVITE, description: "USER_INVITE" },
      ],
    });

    const org = await prisma.organization.create({
      data: { name: "Idempotent Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: [
        { roleId: role.id, permissionCode: Permissions.COA_WRITE },
        { roleId: role.id, permissionCode: Permissions.USER_INVITE },
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

    const accountKey = "account-idem";
    const accountBody = { code: "9900", name: "Idem Account", type: "ASSET" };
    const firstAccount = await request(app.getHttpServer())
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", accountKey)
      .send(accountBody)
      .expect(201);

    const secondAccount = await request(app.getHttpServer())
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", accountKey)
      .send(accountBody)
      .expect(201);

    expect(secondAccount.body.data.id).toBe(firstAccount.body.data.id);

    const inviteKey = "invite-idem";
    const inviteBody = { email: "idem-invite@ledgerlite.local", roleId: role.id };
    const firstInvite = await request(app.getHttpServer())
      .post("/orgs/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", inviteKey)
      .send(inviteBody)
      .expect(201);

    const secondInvite = await request(app.getHttpServer())
      .post("/orgs/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", inviteKey)
      .send(inviteBody)
      .expect(201);

    expect(secondInvite.body.data.token).toBe(firstInvite.body.data.token);
  });
});



