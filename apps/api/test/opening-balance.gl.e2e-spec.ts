import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { NormalBalance, Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import cookieParser from "cookie-parser";
import { HttpErrorFilter } from "../src/common/http-exception.filter";
import { ResponseInterceptor } from "../src/common/response.interceptor";
import { requestContextMiddleware } from "../src/logging/request-context.middleware";
import { Permissions } from "@ledgerlite/shared";

describe("Opening balance GL posting (e2e)", () => {
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
    await prisma.inventoryMovement.deleteMany();
    await prisma.item.deleteMany();
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

  it("posts opening balance to the GL and appears in trial balance", async () => {
    await prisma.permission.createMany({
      data: [
        { code: Permissions.BANK_WRITE, description: Permissions.BANK_WRITE },
        { code: Permissions.REPORTS_VIEW, description: Permissions.REPORTS_VIEW },
      ],
    });

    const org = await prisma.organization.create({
      data: { name: "Opening Balance Org", baseCurrency: "AED", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: [
        { roleId: role.id, permissionCode: Permissions.BANK_WRITE },
        { roleId: role.id, permissionCode: Permissions.REPORTS_VIEW },
      ],
    });

    const user = await prisma.user.create({
      data: { email: "opening@ledgerlite.local", passwordHash: "hash" },
    });

    const membership = await prisma.membership.create({
      data: { orgId: org.id, userId: user.id, roleId: role.id, isActive: true },
    });

    const bankGlAccount = await prisma.account.create({
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

    await prisma.account.create({
      data: {
        orgId: org.id,
        code: "3000",
        name: "Owner's Equity",
        type: "EQUITY",
        subtype: "EQUITY",
        normalBalance: NormalBalance.CREDIT,
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

    const openingBalanceDate = "2026-01-05T00:00:00.000Z";
    const createRes = await request(app.getHttpServer())
      .post("/bank-accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Operating Bank",
        glAccountId: bankGlAccount.id,
        currency: "AED",
        openingBalance: 1000,
        openingBalanceDate,
      })
      .expect(201);

    const bankAccountId = createRes.body?.data?.id ?? createRes.body?.id;
    expect(bankAccountId).toBeDefined();

    const openingHeader = await prisma.gLHeader.findUnique({
      where: {
        orgId_sourceType_sourceId: {
          orgId: org.id,
          sourceType: "JOURNAL",
          sourceId: `OPENING_BALANCE:${bankAccountId}`,
        },
      },
      include: { lines: true },
    });

    expect(openingHeader).toBeTruthy();
    expect(openingHeader?.lines.length).toBe(2);

    const trialRes = await request(app.getHttpServer())
      .get("/reports/trial-balance")
      .set("Authorization", `Bearer ${token}`)
      .query({ from: "2026-01-01", to: "2026-01-31" })
      .expect(200);

    const trial = trialRes.body?.data ?? trialRes.body;
    expect(trial.totals.debit).toBe("1000.00");
    expect(trial.totals.credit).toBe("1000.00");

    const bankRow = trial.rows.find((row: { code: string }) => row.code === "1010");
    const equityRow = trial.rows.find((row: { code: string }) => row.code === "3000");

    expect(bankRow).toBeTruthy();
    expect(bankRow.debit).toBe("1000.00");
    expect(bankRow.credit).toBe("0.00");

    expect(equityRow).toBeTruthy();
    expect(equityRow.debit).toBe("0.00");
    expect(equityRow.credit).toBe("1000.00");
  });
});


