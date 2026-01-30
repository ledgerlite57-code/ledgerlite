import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { type BankAccountCreateInput, type BankAccountUpdateInput } from "@ledgerlite/shared";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { dec, round2 } from "../../common/money";

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listBankAccounts(orgId?: string, includeInactive?: boolean) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const where: Prisma.BankAccountWhereInput = { orgId };
    if (!includeInactive) {
      where.isActive = true;
    }

    return this.prisma.bankAccount.findMany({
      where,
      include: { glAccount: true },
      orderBy: { name: "asc" },
    });
  }

  async createBankAccount(
    orgId?: string,
    actorUserId?: string,
    input?: BankAccountCreateInput,
    idempotencyKey?: string,
  ) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const scopedKey = buildIdempotencyKey(idempotencyKey, {
      scope: "bank-accounts.create",
      actorUserId,
    });
    const requestHash = scopedKey ? hashRequestBody(input) : null;
    if (scopedKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: scopedKey } },
      });
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw new ConflictException("Idempotency key already used with different payload");
        }
        return existingKey.response as unknown as object;
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const glAccount = await this.prisma.account.findFirst({
      where: { id: input.glAccountId, orgId, isActive: true },
    });
    if (!glAccount) {
      throw new BadRequestException("GL account not found");
    }
    if (glAccount.subtype !== "BANK") {
      throw new BadRequestException("GL account must be a BANK subtype");
    }

    const currency = input.currency ?? org.baseCurrency;
    if (!currency) {
      throw new BadRequestException("Currency is required");
    }

    let bankAccount;
    try {
      bankAccount = await this.prisma.$transaction(async (tx) => {
        const created = await tx.bankAccount.create({
          data: {
            orgId,
            name: input.name,
            accountNumberMasked: input.accountNumberMasked,
            currency,
            glAccountId: glAccount.id,
            openingBalance: input.openingBalance ?? 0,
            openingBalanceDate: input.openingBalanceDate ? new Date(input.openingBalanceDate) : undefined,
            isActive: input.isActive ?? true,
          },
          include: { glAccount: true },
        });

        const openingBalance = round2(input.openingBalance ?? 0);
        if (openingBalance.greaterThan(0)) {
          await this.createOpeningBalanceEntry(tx, org, created, openingBalance, input.openingBalanceDate, actorUserId);
        }

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Bank account name already exists");
      }
      throw err;
    }

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BANK_ACCOUNT",
      entityId: bankAccount.id,
      action: AuditAction.CREATE,
      after: bankAccount,
    });

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: bankAccount as unknown as object,
          statusCode: 201,
        },
      });
    }

    return bankAccount;
  }

  async updateBankAccount(orgId?: string, bankAccountId?: string, actorUserId?: string, input?: BankAccountUpdateInput) {
    if (!orgId || !bankAccountId) {
      throw new NotFoundException("Bank account not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const existing = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, orgId },
    });
    if (!existing) {
      throw new NotFoundException("Bank account not found");
    }

    let glAccountId = existing.glAccountId;
    if (input.glAccountId) {
      const glAccount = await this.prisma.account.findFirst({
        where: { id: input.glAccountId, orgId, isActive: true },
      });
      if (!glAccount) {
        throw new BadRequestException("GL account not found");
      }
      if (glAccount.subtype !== "BANK") {
        throw new BadRequestException("GL account must be a BANK subtype");
      }
      glAccountId = glAccount.id;
    }

    const nextOpeningBalance =
      input.openingBalance !== undefined ? round2(input.openingBalance) : round2(existing.openingBalance);
    const nextOpeningBalanceDate = input.openingBalanceDate
      ? new Date(input.openingBalanceDate)
      : existing.openingBalanceDate;
    const openingBalanceChanged =
      input.openingBalance !== undefined && !round2(existing.openingBalance ?? 0).equals(nextOpeningBalance);
    const openingDateChanged =
      input.openingBalanceDate !== undefined &&
      (existing.openingBalanceDate?.getTime() ?? 0) !== (nextOpeningBalanceDate?.getTime() ?? 0);

    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        if (openingBalanceChanged || openingDateChanged) {
          const openingHeader = await tx.gLHeader.findUnique({
            where: {
              orgId_sourceType_sourceId: {
                orgId,
                sourceType: "JOURNAL",
                sourceId: `OPENING_BALANCE:${bankAccountId}`,
              },
            },
            select: { id: true },
          });

          if (openingHeader) {
            throw new ConflictException("Opening balance already posted; adjust via a journal entry");
          }
        }

        const updatedAccount = await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: {
            name: input.name ?? existing.name,
            accountNumberMasked: input.accountNumberMasked ?? existing.accountNumberMasked,
            currency: input.currency ?? existing.currency,
            glAccountId,
            openingBalance: input.openingBalance ?? existing.openingBalance,
            openingBalanceDate: input.openingBalanceDate
              ? new Date(input.openingBalanceDate)
              : existing.openingBalanceDate,
            isActive: input.isActive ?? existing.isActive,
          },
          include: { glAccount: true },
        });

        if ((openingBalanceChanged || openingDateChanged) && nextOpeningBalance.greaterThan(0)) {
          const org = await tx.organization.findUnique({ where: { id: orgId } });
          if (!org) {
            throw new NotFoundException("Organization not found");
          }
          await this.createOpeningBalanceEntry(
            tx,
            org,
            updatedAccount,
            nextOpeningBalance,
            input.openingBalanceDate,
            actorUserId,
          );
        }

        return updatedAccount;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Bank account name already exists");
      }
      throw err;
    }

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BANK_ACCOUNT",
      entityId: bankAccountId,
      action: AuditAction.UPDATE,
      before: existing,
      after: updated,
    });

    return updated;
  }

  private async createOpeningBalanceEntry(
    tx: Prisma.TransactionClient,
    org: { id: string; baseCurrency: string | null },
    bankAccount: { id: string; name: string; currency: string; glAccountId: string },
    openingBalance: Prisma.Decimal,
    openingBalanceDate: BankAccountCreateInput["openingBalanceDate"],
    actorUserId?: string,
  ) {
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    ensureBaseCurrencyOnly(org.baseCurrency, bankAccount.currency);

    const equityAccount =
      (await tx.account.findFirst({
        where: { orgId: org.id, subtype: "EQUITY", isActive: true },
        select: { id: true },
      })) ??
      (await tx.account.findFirst({
        where: { orgId: org.id, type: "EQUITY", isActive: true },
        select: { id: true },
      }));

    if (!equityAccount) {
      throw new BadRequestException("Equity account is required to post opening balance");
    }

    const postingDate = openingBalanceDate ? new Date(openingBalanceDate) : new Date();
    const lines = [
      {
        lineNo: 1,
        accountId: bankAccount.glAccountId,
        debit: openingBalance,
        credit: dec(0),
        description: `Opening balance - ${bankAccount.name}`,
      },
      {
        lineNo: 2,
        accountId: equityAccount.id,
        debit: dec(0),
        credit: openingBalance,
        description: "Opening balance equity",
      },
    ];

    const totals = assertGlLinesValid(lines);

    await tx.gLHeader.create({
      data: {
        orgId: org.id,
        sourceType: "JOURNAL",
        sourceId: `OPENING_BALANCE:${bankAccount.id}`,
        postingDate,
        currency: bankAccount.currency,
        exchangeRate: null,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        status: "POSTED",
        createdByUserId: actorUserId,
        memo: `Opening balance for ${bankAccount.name}`,
        lines: {
          createMany: {
            data: lines.map((line) => ({
              lineNo: line.lineNo,
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: line.description ?? undefined,
            })),
          },
        },
      },
    });
  }
}
