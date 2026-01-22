import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { type BankAccountCreateInput, type BankAccountUpdateInput } from "@ledgerlite/shared";

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

    const requestHash = idempotencyKey ? hashRequestBody(input) : null;
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { orgId_key: { orgId, key: idempotencyKey } },
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
      bankAccount = await this.prisma.bankAccount.create({
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

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
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

    let updated;
    try {
      updated = await this.prisma.bankAccount.update({
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
}
