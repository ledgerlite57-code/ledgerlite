import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { dedupeImportTransactions } from "../../bank-transactions.utils";
import { dec, round2 } from "../../common/money";
import { type BankTransactionImportInput } from "@ledgerlite/shared";

@Injectable()
export class BankTransactionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async importTransactions(
    orgId?: string,
    actorUserId?: string,
    input?: BankTransactionImportInput,
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

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, orgId, isActive: true },
    });
    if (!bankAccount) {
      throw new NotFoundException("Bank account not found");
    }

    const { unique, skipped: skippedDuplicates } = dedupeImportTransactions(input.transactions);
    const normalized = unique.map((transaction) => {
      const currency = transaction.currency ?? bankAccount.currency;
      if (!currency) {
        throw new BadRequestException("Currency is required");
      }
      if (bankAccount.currency && bankAccount.currency !== currency) {
        throw new BadRequestException("Transaction currency must match bank account currency");
      }
      return {
        txnDate: new Date(transaction.txnDate),
        description: transaction.description.trim(),
        amount: round2(dec(transaction.amount)),
        currency,
        externalRef: transaction.externalRef?.trim() ?? null,
      };
    });

    const externalRefs = normalized
      .map((transaction) => transaction.externalRef)
      .filter((ref): ref is string => Boolean(ref));

    const existingRefs = externalRefs.length
      ? await this.prisma.bankTransaction.findMany({
          where: {
            orgId,
            bankAccountId: bankAccount.id,
            externalRef: { in: externalRefs },
          },
          select: { externalRef: true },
        })
      : [];
    const existingRefSet = new Set(existingRefs.map((record) => record.externalRef).filter(Boolean));

    const filtered = normalized.filter((transaction) => {
      if (!transaction.externalRef) {
        return true;
      }
      return !existingRefSet.has(transaction.externalRef);
    });

    const createResult = filtered.length
      ? await this.prisma.bankTransaction.createMany({
          data: filtered.map((transaction) => ({
            orgId,
            bankAccountId: bankAccount.id,
            txnDate: transaction.txnDate,
            description: transaction.description,
            amount: transaction.amount,
            currency: transaction.currency,
            externalRef: transaction.externalRef,
            source: "IMPORT",
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

    const skippedExisting = normalized.length - filtered.length;
    const skippedByUnique = filtered.length - createResult.count;
    const skipped = skippedDuplicates + skippedExisting + skippedByUnique;

    const response = {
      imported: createResult.count,
      skipped,
    };

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "BANK_TRANSACTION_IMPORT",
      entityId: bankAccount.id,
      action: AuditAction.CREATE,
      after: {
        bankAccountId: bankAccount.id,
        imported: response.imported,
        skipped: response.skipped,
      },
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: response as unknown as object,
          statusCode: 201,
        },
      });
    }

    return response;
  }
}
