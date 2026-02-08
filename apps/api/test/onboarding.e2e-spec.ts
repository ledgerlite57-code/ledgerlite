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

describe("Onboarding checklist (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

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
    await prisma.creditNoteAllocation.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.idempotencyKey.deleteMany();
    await prisma.onboardingProgressStep.deleteMany();
    await prisma.onboardingProgress.deleteMany();
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
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  };

  const seedPermissions = async (codes: string[]) => {
    await prisma.permission.createMany({
      data: [...new Set(codes)].map((code) => ({ code, description: code })),
      skipDuplicates: true,
    });
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

  it("creates owner-track onboarding progress and persists it across requests", async () => {
    const ownerPermissions = [
      Permissions.ORG_READ,
      Permissions.ORG_WRITE,
      Permissions.COA_READ,
      Permissions.TAX_READ,
      Permissions.BANK_READ,
      Permissions.USER_INVITE,
      Permissions.JOURNAL_POST,
    ];
    await seedPermissions(ownerPermissions);

    const org = await prisma.organization.create({
      data: {
        name: "Owner Onboarding Org",
        legalName: "Owner Onboarding LLC",
        countryCode: "AE",
        baseCurrency: "AED",
        fiscalYearStartMonth: 1,
        timeZone: "Asia/Dubai",
        vatEnabled: true,
      },
    });

    const ownerRole = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: ownerPermissions.map((permissionCode) => ({ roleId: ownerRole.id, permissionCode })),
      skipDuplicates: true,
    });

    const ownerUser = await prisma.user.create({
      data: { email: "owner-onboarding@ledgerlite.local", passwordHash: "hash" },
    });
    const ownerMembership = await prisma.membership.create({
      data: { orgId: org.id, userId: ownerUser.id, roleId: ownerRole.id, isActive: true },
    });

    const arAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "AR",
        normalBalance: "DEBIT",
      },
    });
    const apAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2000",
        name: "Accounts Payable",
        type: "LIABILITY",
        subtype: "AP",
        normalBalance: "CREDIT",
      },
    });
    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "2100",
        name: "VAT Payable",
        type: "LIABILITY",
        subtype: "VAT_PAYABLE",
        normalBalance: "CREDIT",
      },
    });
    const bankAccountGl = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "1010",
        name: "Main Bank",
        type: "ASSET",
        subtype: "BANK",
        normalBalance: "DEBIT",
      },
    });

    await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        defaultArAccountId: arAccount.id,
        defaultApAccountId: apAccount.id,
      },
    });

    await prisma.taxCode.create({
      data: {
        orgId: org.id,
        name: "VAT 5%",
        rate: 5,
        type: "STANDARD",
        isActive: true,
      },
    });

    await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        name: "Operating Bank",
        currency: "AED",
        glAccountId: bankAccountGl.id,
      },
    });

    const teammate = await prisma.user.create({
      data: { email: "team-member@ledgerlite.local", passwordHash: "hash" },
    });
    await prisma.membership.create({
      data: { orgId: org.id, userId: teammate.id, roleId: ownerRole.id, isActive: true },
    });

    await prisma.journalEntry.create({
      data: {
        orgId: org.id,
        number: "JE-0001",
        status: "POSTED",
        journalDate: new Date(),
        postedAt: new Date(),
        createdByUserId: ownerUser.id,
        memo: "First transaction",
      },
    });

    const token = jwt.sign(
      { sub: ownerUser.id, orgId: org.id, membershipId: ownerMembership.id, roleId: ownerRole.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const first = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(first.body.data.track).toBe("OWNER");
    expect(first.body.data.summary.totalSteps).toBe(6);
    expect(first.body.data.summary.pendingSteps).toBe(0);
    expect(first.body.data.summary.completedSteps).toBe(6);
    expect(first.body.data.steps.every((step: { status: string }) => step.status === "COMPLETED")).toBe(true);

    const progressId = first.body.data.id as string;
    const second = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(second.body.data.id).toBe(progressId);
  });

  it("assigns operator track and auto-progresses master data + first transaction steps", async () => {
    const operatorPermissions = [Permissions.ORG_READ, Permissions.CUSTOMER_WRITE, Permissions.JOURNAL_POST];
    await seedPermissions(operatorPermissions);

    const org = await prisma.organization.create({
      data: { name: "Operator Onboarding Org", baseCurrency: "AED", countryCode: "AE" },
    });

    const operatorRole = await prisma.role.create({
      data: { orgId: org.id, name: "Sales", isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: operatorPermissions.map((permissionCode) => ({ roleId: operatorRole.id, permissionCode })),
      skipDuplicates: true,
    });

    const operatorUser = await prisma.user.create({
      data: { email: "operator-onboarding@ledgerlite.local", passwordHash: "hash" },
    });
    const operatorMembership = await prisma.membership.create({
      data: { orgId: org.id, userId: operatorUser.id, roleId: operatorRole.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: operatorUser.id, orgId: org.id, membershipId: operatorMembership.id, roleId: operatorRole.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const initial = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(initial.body.data.track).toBe("OPERATOR");
    expect(initial.body.data.summary.totalSteps).toBe(2);
    expect(initial.body.data.summary.pendingSteps).toBe(2);

    const initialProgressId = initial.body.data.id as string;

    await prisma.customer.create({
      data: {
        orgId: org.id,
        name: "Acme Trading LLC",
      },
    });

    const afterCustomer = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const masterDataStep = afterCustomer.body.data.steps.find(
      (step: { stepId: string }) => step.stepId === "MASTER_DATA",
    ) as { status: string };
    expect(masterDataStep.status).toBe("COMPLETED");

    await prisma.journalEntry.create({
      data: {
        orgId: org.id,
        number: "JE-1001",
        status: "POSTED",
        journalDate: new Date(),
        postedAt: new Date(),
        createdByUserId: operatorUser.id,
        memo: "Operator first posted entry",
      },
    });

    const afterTransaction = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const firstTransactionStep = afterTransaction.body.data.steps.find(
      (step: { stepId: string }) => step.stepId === "FIRST_TRANSACTION",
    ) as { status: string };
    expect(firstTransactionStep.status).toBe("COMPLETED");
    expect(afterTransaction.body.data.summary.pendingSteps).toBe(0);
    expect(afterTransaction.body.data.id).toBe(initialProgressId);
  });

  it("supports partial onboarding progress and resume across requests", async () => {
    const permissions = [Permissions.ORG_READ];
    await seedPermissions(permissions);

    const org = await prisma.organization.create({
      data: { name: "Resume Onboarding Org", baseCurrency: "AED", countryCode: "AE" },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permissionCode) => ({ roleId: role.id, permissionCode })),
      skipDuplicates: true,
    });

    const user = await prisma.user.create({
      data: { email: "resume-onboarding@ledgerlite.local", passwordHash: "hash" },
    });
    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const token = jwt.sign(
      { sub: user.id, orgId: org.id, membershipId: membership.id, roleId: role.id },
      { secret: process.env.API_JWT_SECRET },
    );

    const initial = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    for (const step of initial.body.data.steps as { stepId: string }[]) {
      await request(app.getHttpServer())
        .patch(`/orgs/onboarding/steps/${step.stepId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "PENDING" })
        .expect(200);
    }

    const baseline = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const pendingStep = baseline.body.data.steps.find((step: { status: string }) => step.status === "PENDING");
    expect(pendingStep).toBeTruthy();
    const firstStepId = pendingStep.stepId as string;
    const baselineCompleted = baseline.body.data.summary.completedSteps as number;
    const baselinePending = baseline.body.data.summary.pendingSteps as number;

    const partial = await request(app.getHttpServer())
      .patch(`/orgs/onboarding/steps/${firstStepId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "COMPLETED" })
      .expect(200);

    expect(partial.body.data.summary.completedSteps).toBe(baselineCompleted + 1);
    expect(partial.body.data.summary.pendingSteps).toBe(baselinePending - 1);

    const resumed = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const resumedStep = resumed.body.data.steps.find((step: { stepId: string }) => step.stepId === firstStepId);
    expect(resumedStep?.status).toBe("COMPLETED");

    for (const step of resumed.body.data.steps as { stepId: string }[]) {
      await request(app.getHttpServer())
        .patch(`/orgs/onboarding/steps/${step.stepId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "COMPLETED" })
        .expect(200);
    }

    const completed = await request(app.getHttpServer())
      .post("/orgs/onboarding/complete")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(completed.body.data.summary.pendingSteps).toBe(0);
    expect(completed.body.data.completedAt).toBeTruthy();

    const final = await request(app.getHttpServer())
      .get("/orgs/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(final.body.data.completedAt).toBeTruthy();
  });
});

