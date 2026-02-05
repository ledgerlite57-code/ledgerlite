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
import { MailerService } from "../src/common/mailer.service";

describe("Invite email (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const mailer = { sendInviteEmail: jest.fn() };

  const resetDb = async () => {
    await prisma.expenseLine.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.inventoryMovement.deleteMany();
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
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.idempotencyKey.deleteMany();
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

  beforeAll(async () => {
    process.env.API_JWT_SECRET = "test_access_secret";
    process.env.API_JWT_REFRESH_SECRET = "test_refresh_secret";
    process.env.WEB_BASE_URL = "http://localhost:3000";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useValue(mailer)
      .compile();

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
    mailer.sendInviteEmail.mockClear();
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sends an invite email with a tokenized link", async () => {
    await prisma.permission.createMany({
      data: [Permissions.USER_INVITE].map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "Invite Email Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: [{ roleId: role.id, permissionCode: Permissions.USER_INVITE }],
    });

    const user = await prisma.user.create({
      data: { email: "invite-owner@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const inviteRes = await request(app.getHttpServer())
      .post("/orgs/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new-user@ledgerlite.local", roleId: role.id })
      .expect(201);

    const inviteToken = inviteRes.body.data.token as string;
    expect(inviteToken).toBeTruthy();

    expect(mailer.sendInviteEmail).toHaveBeenCalledTimes(1);
    const [to, link] = mailer.sendInviteEmail.mock.calls[0];
    expect(to).toBe("new-user@ledgerlite.local");
    expect(link).toContain("/invite?token=");
    expect(link).toContain(inviteToken);
  });

  it("supports invite lifecycle listing, resend, and revoke", async () => {
    await prisma.permission.createMany({
      data: [Permissions.USER_INVITE].map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "Invite Lifecycle Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: [{ roleId: role.id, permissionCode: Permissions.USER_INVITE }],
    });

    const user = await prisma.user.create({
      data: { email: "invite-admin@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const inviteRes = await request(app.getHttpServer())
      .post("/orgs/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "lifecycle-user@ledgerlite.local", roleId: role.id, expiresInDays: 3 })
      .expect(201);

    const inviteId = inviteRes.body.data.inviteId as string;
    expect(inviteId).toBeTruthy();

    const listRes = await request(app.getHttpServer())
      .get("/orgs/users/invites")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].status).toBe("SENT");
    expect(listRes.body.data[0].sendCount).toBe(1);

    const resendRes = await request(app.getHttpServer())
      .post(`/orgs/users/invites/${inviteId}/resend`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresInDays: 5 })
      .expect(200);

    expect(resendRes.body.data.inviteId).toBe(inviteId);
    expect(resendRes.body.data.sendCount).toBe(2);
    expect(resendRes.body.data.status).toBe("SENT");
    expect(mailer.sendInviteEmail).toHaveBeenCalledTimes(2);

    const revokeRes = await request(app.getHttpServer())
      .post(`/orgs/users/invites/${inviteId}/revoke`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(revokeRes.body.data.id).toBe(inviteId);
    expect(revokeRes.body.data.status).toBe("REVOKED");

    const lifecycleLogs = await prisma.auditLog.findMany({
      where: {
        orgId: org.id,
        entityType: "INVITE",
        entityId: inviteId,
        action: "UPDATE",
      },
      orderBy: { createdAt: "asc" },
    });
    const events = lifecycleLogs.map((row) => (row.after as { event?: string } | null)?.event).filter(Boolean);
    expect(events).toContain("RESEND");
    expect(events).toContain("REVOKE");

    await request(app.getHttpServer())
      .post(`/orgs/users/invites/${inviteId}/resend`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(409);
  });

  it("enforces one-time and expiry controls on invite links", async () => {
    await prisma.permission.createMany({
      data: [Permissions.USER_INVITE].map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });

    const org = await prisma.organization.create({
      data: { name: "Invite Security Org", baseCurrency: "AED" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: [{ roleId: role.id, permissionCode: Permissions.USER_INVITE }],
    });

    const user = await prisma.user.create({
      data: { email: "invite-security-admin@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const inviteRes = await request(app.getHttpServer())
      .post("/orgs/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "security-user@ledgerlite.local", roleId: role.id })
      .expect(201);

    const inviteToken = inviteRes.body.data.token as string;
    const inviteId = inviteRes.body.data.inviteId as string;
    expect(inviteToken).toBeTruthy();
    expect(inviteId).toBeTruthy();

    await request(app.getHttpServer())
      .post("/orgs/users/invite/accept")
      .send({ token: inviteToken, password: "Password123!" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/orgs/users/invite/accept")
      .send({ token: inviteToken, password: "Password123!" })
      .expect(409);

    const expiredCreate = await request(app.getHttpServer())
      .post("/orgs/users/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "expired-link-user@ledgerlite.local", roleId: role.id })
      .expect(201);

    const expiredToken = expiredCreate.body.data.token as string;
    const expiredInviteId = expiredCreate.body.data.inviteId as string;

    await prisma.invite.update({
      where: { id: expiredInviteId },
      data: { expiresAt: new Date(Date.now() - 5_000) },
    });

    const expiredResponse = await request(app.getHttpServer())
      .post("/orgs/users/invite/accept")
      .send({ token: expiredToken, password: "Password123!" })
      .expect(409);

    expect(expiredResponse.body?.error?.message).toBe("Invite expired");
  });
});

