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

type GlLineInput = { accountId: string; debit: number; credit: number };

describe("Reconciliation matching (e2e)", () => {
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
    await prisma.item.deleteMany();
    await prisma.taxCode.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.customer.deleteMany();
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

  const createAuthContext = async () => {
    await prisma.permission.create({
      data: { code: Permissions.RECONCILE_MANAGE, description: Permissions.RECONCILE_MANAGE },
    });

    const org = await prisma.organization.create({
      data: { name: "Recon Org", baseCurrency: "AED", vatEnabled: false },
    });

    const role = await prisma.role.create({
      data: { orgId: org.id, name: "Owner", isSystem: true },
    });

    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionCode: Permissions.RECONCILE_MANAGE },
    });

    const user = await prisma.user.create({
      data: { email: "recon-match@ledgerlite.local", passwordHash: "hash" },
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

    const revenueAccount = await prisma.account.create({
      data: {
        orgId: org.id,
        code: "4000",
        name: "Revenue",
        type: "INCOME",
        subtype: "SALES",
        normalBalance: NormalBalance.CREDIT,
        isActive: true,
      },
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        name: "Operating Bank",
        currency: "AED",
        glAccountId: bankGlAccount.id,
        isActive: true,
      },
    });

    return { org, user, token, bankAccount, bankGlAccount, revenueAccount };
  };

  const createSession = async (
    token: string,
    bankAccountId: string,
    periodStart: string,
    periodEnd: string,
    openingBalance: number,
    closingBalance: number,
  ) => {
    const response = await request(app.getHttpServer())
      .post("/reconciliation-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        bankAccountId,
        periodStart,
        periodEnd,
        statementOpeningBalance: openingBalance,
        statementClosingBalance: closingBalance,
      })
      .expect(201);

    return response.body?.data ?? response.body;
  };

  const createBankTransaction = async (
    orgId: string,
    bankAccountId: string,
    txnDate: string,
    amount: number,
    externalRef: string,
  ) => {
    return prisma.bankTransaction.create({
      data: {
        orgId,
        bankAccountId,
        txnDate: new Date(txnDate),
        description: "Bank txn",
        amount: new Prisma.Decimal(amount),
        currency: "AED",
        externalRef,
        source: "IMPORT",
      },
    });
  };

  const createGlHeader = async (
    orgId: string,
    userId: string,
    postingDate: string,
    sourceId: string,
    lines: GlLineInput[],
  ) => {
    const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

    return prisma.gLHeader.create({
      data: {
        orgId,
        sourceType: "JOURNAL",
        sourceId,
        postingDate: new Date(postingDate),
        currency: "AED",
        exchangeRate: new Prisma.Decimal(1),
        totalDebit: new Prisma.Decimal(totalDebit),
        totalCredit: new Prisma.Decimal(totalCredit),
        status: "POSTED",
        createdByUserId: userId,
        memo: "Test entry",
        lines: {
          createMany: {
            data: lines.map((line, index) => ({
              lineNo: index + 1,
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
            })),
          },
        },
      },
      include: { lines: true },
    });
  };

  it("supports split matches across multiple GL headers", async () => {
    const { org, user, token, bankAccount, bankGlAccount, revenueAccount } = await createAuthContext();

    const session = await createSession(token, bankAccount.id, "2026-01-01", "2026-01-31", 0, 100);
    const bankTransaction = await createBankTransaction(
      org.id,
      bankAccount.id,
      "2026-01-10T00:00:00.000Z",
      100,
      "TXN-SPLIT-1",
    );

    const glHeader1 = await createGlHeader(org.id, user.id, "2026-01-10T00:00:00.000Z", "JOURNAL-SPLIT-1", [
      { accountId: bankGlAccount.id, debit: 60, credit: 0 },
      { accountId: revenueAccount.id, debit: 0, credit: 60 },
    ]);

    const glHeader2 = await createGlHeader(org.id, user.id, "2026-01-10T00:00:00.000Z", "JOURNAL-SPLIT-2", [
      { accountId: bankGlAccount.id, debit: 40, credit: 0 },
      { accountId: revenueAccount.id, debit: 0, credit: 40 },
    ]);

    await request(app.getHttpServer())
      .post(`/reconciliation-sessions/${session.id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ bankTransactionId: bankTransaction.id, glHeaderId: glHeader1.id, amount: 60 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reconciliation-sessions/${session.id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ bankTransactionId: bankTransaction.id, glHeaderId: glHeader2.id, amount: 40 })
      .expect(201);

    const refreshed = await prisma.bankTransaction.findUnique({ where: { id: bankTransaction.id } });
    expect(refreshed?.matched).toBe(true);
  });

  it("blocks matching when amount exceeds remaining bank transaction balance", async () => {
    const { org, user, token, bankAccount, bankGlAccount, revenueAccount } = await createAuthContext();

    const session = await createSession(token, bankAccount.id, "2026-01-01", "2026-01-31", 0, 100);
    const bankTransaction = await createBankTransaction(
      org.id,
      bankAccount.id,
      "2026-01-10T00:00:00.000Z",
      100,
      "TXN-SPLIT-2",
    );

    const glHeader = await createGlHeader(org.id, user.id, "2026-01-10T00:00:00.000Z", "JOURNAL-SPLIT-3", [
      { accountId: bankGlAccount.id, debit: 100, credit: 0 },
      { accountId: revenueAccount.id, debit: 0, credit: 100 },
    ]);

    await request(app.getHttpServer())
      .post(`/reconciliation-sessions/${session.id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ bankTransactionId: bankTransaction.id, glHeaderId: glHeader.id, amount: 60 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reconciliation-sessions/${session.id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .send({ bankTransactionId: bankTransaction.id, glHeaderId: glHeader.id, amount: 50 })
      .expect(409);
  });
});


