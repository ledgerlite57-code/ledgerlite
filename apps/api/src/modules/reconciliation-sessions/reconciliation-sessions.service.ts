import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, ReconciliationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { buildIdempotencyKey, hashRequestBody } from "../../common/idempotency";
import { dec, round2 } from "../../common/money";
import type {
  PaginationInput,
  ReconciliationCloseInput,
  ReconciliationMatchInput,
  ReconciliationSessionCreateInput,
} from "@ledgerlite/shared";

type SessionListParams = PaginationInput & { bankAccountId?: string; status?: string };

@Injectable()
export class ReconciliationSessionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listSessions(orgId?: string, params?: SessionListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const where: Prisma.ReconciliationSessionWhereInput = { orgId };

    if (params?.bankAccountId) {
      where.bankAccountId = params.bankAccountId;
    }
    if (params?.status) {
      const normalized = params.status.toUpperCase();
      if (Object.values(ReconciliationStatus).includes(normalized as ReconciliationStatus)) {
        where.status = normalized as ReconciliationStatus;
      }
    }

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.reconciliationSession.findMany({
        where,
        include: { bankAccount: true },
        orderBy: { periodStart: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.reconciliationSession.count({ where }),
    ]);

    return {
      data,
      pageInfo: {
        page,
        pageSize,
        total,
      },
    };
  }

  async getSession(orgId?: string, sessionId?: string) {
    if (!orgId || !sessionId) {
      throw new NotFoundException("Reconciliation session not found");
    }

    const session = await this.prisma.reconciliationSession.findFirst({
      where: { id: sessionId, orgId },
      include: {
        bankAccount: true,
        matches: { include: { bankTransaction: true, glHeader: true }, orderBy: { createdAt: "desc" } },
      },
    });

    if (!session) {
      throw new NotFoundException("Reconciliation session not found");
    }

    const bankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        orgId,
        bankAccountId: session.bankAccountId,
        txnDate: {
          gte: session.periodStart,
          lte: session.periodEnd,
        },
      },
      orderBy: { txnDate: "desc" },
    });

    const glHeaders = await this.prisma.gLHeader.findMany({
      where: {
        orgId,
        postingDate: {
          gte: session.periodStart,
          lte: session.periodEnd,
        },
      },
      orderBy: { postingDate: "desc" },
      take: 200,
    });

    return {
      session,
      bankTransactions,
      glHeaders,
    };
  }

  async createSession(
    orgId?: string,
    actorUserId?: string,
    input?: ReconciliationSessionCreateInput,
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
      scope: "reconciliation-sessions.create",
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

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, orgId },
    });
    if (!bankAccount) {
      throw new NotFoundException("Bank account not found");
    }
    if (!bankAccount.isActive) {
      throw new BadRequestException("Bank account must be active");
    }

    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    if (periodEnd < periodStart) {
      throw new BadRequestException("Period end must be after start");
    }

    const overlap = await this.prisma.reconciliationSession.findFirst({
      where: {
        orgId,
        bankAccountId: bankAccount.id,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
    });
    if (overlap) {
      throw new ConflictException("Reconciliation session overlaps an existing period");
    }

    let session;
    try {
      session = await this.prisma.reconciliationSession.create({
        data: {
          orgId,
          bankAccountId: bankAccount.id,
          periodStart,
          periodEnd,
          statementOpeningBalance: round2(input.statementOpeningBalance),
          statementClosingBalance: round2(input.statementClosingBalance),
          status: "OPEN",
          createdByUserId: actorUserId,
        },
        include: { bankAccount: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Reconciliation session already exists for this period");
      }
      throw err;
    }

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "RECONCILIATION_SESSION",
      entityId: session.id,
      action: AuditAction.CREATE,
      after: session,
    });

    if (scopedKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: scopedKey,
          requestHash,
          response: session as unknown as object,
          statusCode: 201,
        },
      });
    }

    return session;
  }

  async matchTransaction(
    orgId?: string,
    sessionId?: string,
    actorUserId?: string,
    input?: ReconciliationMatchInput,
  ) {
    if (!orgId || !sessionId) {
      throw new NotFoundException("Reconciliation session not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const match = await this.prisma.$transaction(async (tx) => {
      const session = await tx.reconciliationSession.findFirst({
        where: { id: sessionId, orgId },
      });
      if (!session) {
        throw new NotFoundException("Reconciliation session not found");
      }
      if (session.status === "CLOSED") {
        throw new ConflictException("Reconciliation session is closed");
      }

      const bankTransaction = await tx.bankTransaction.findFirst({
        where: { id: input.bankTransactionId, orgId },
      });
      if (!bankTransaction) {
        throw new NotFoundException("Bank transaction not found");
      }
      if (bankTransaction.bankAccountId !== session.bankAccountId) {
        throw new BadRequestException("Bank transaction does not belong to this session");
      }
      if (bankTransaction.txnDate < session.periodStart || bankTransaction.txnDate > session.periodEnd) {
        throw new BadRequestException("Bank transaction is outside the reconciliation period");
      }

      const glHeader = await tx.gLHeader.findFirst({
        where: { id: input.glHeaderId, orgId },
        select: { id: true, postingDate: true, status: true, reversedByHeaderId: true },
      });
      if (!glHeader) {
        throw new NotFoundException("GL header not found");
      }
      if (glHeader.status !== "POSTED") {
        throw new ConflictException("GL header is not posted");
      }
      if (glHeader.reversedByHeaderId) {
        throw new ConflictException("GL header has been reversed");
      }
      if (glHeader.postingDate < session.periodStart || glHeader.postingDate > session.periodEnd) {
        throw new BadRequestException("GL posting date is outside the reconciliation period");
      }

      const existingMatch = await tx.reconciliationMatch.findFirst({
        where: { bankTransactionId: bankTransaction.id, glHeaderId: glHeader.id },
      });
      if (existingMatch) {
        throw new ConflictException("Bank transaction is already matched to this GL entry");
      }
      const existingMatchOtherSession = await tx.reconciliationMatch.findFirst({
        where: {
          bankTransactionId: bankTransaction.id,
          reconciliationSessionId: { not: session.id },
        },
      });
      if (existingMatchOtherSession) {
        throw new ConflictException("Bank transaction is already matched in another session");
      }

      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: session.bankAccountId, orgId },
        select: { glAccountId: true },
      });
      if (!bankAccount) {
        throw new NotFoundException("Bank account not found");
      }

      const bankLine = await tx.gLLine.findFirst({
        where: { headerId: glHeader.id, accountId: bankAccount.glAccountId },
      });
      if (!bankLine) {
        throw new BadRequestException("GL entry does not affect the bank account");
      }

      const bankLineAmount = round2(dec(bankLine.debit).sub(bankLine.credit));
      if (bankLineAmount.equals(0)) {
        throw new BadRequestException("Bank GL line amount is zero");
      }

      const matchedForTxnAgg = await tx.reconciliationMatch.aggregate({
        where: { bankTransactionId: bankTransaction.id },
        _sum: { amount: true },
      });
      const matchedForTxn = dec(matchedForTxnAgg._sum.amount ?? 0);
      const remainingTxn = round2(dec(bankTransaction.amount).sub(matchedForTxn));
      if (remainingTxn.equals(0)) {
        throw new ConflictException("Bank transaction is already fully matched");
      }

      const requestedAmount = input.amount !== undefined ? round2(input.amount) : remainingTxn;
      if (requestedAmount.equals(0)) {
        throw new BadRequestException("Match amount must be non-zero");
      }

      const txnAmount = round2(dec(bankTransaction.amount));
      if (
        (txnAmount.greaterThan(0) && requestedAmount.lessThan(0)) ||
        (txnAmount.lessThan(0) && requestedAmount.greaterThan(0))
      ) {
        throw new BadRequestException("Match amount must have the same sign as the bank transaction");
      }
      if (requestedAmount.abs().greaterThan(remainingTxn.abs())) {
        throw new ConflictException("Match amount exceeds remaining bank transaction balance");
      }

      const matchedForHeaderAgg = await tx.reconciliationMatch.aggregate({
        where: { glHeaderId: glHeader.id },
        _sum: { amount: true },
      });
      const matchedForHeader = dec(matchedForHeaderAgg._sum.amount ?? 0);
      const remainingHeader = round2(bankLineAmount.sub(matchedForHeader));
      if (
        (bankLineAmount.greaterThan(0) && requestedAmount.lessThan(0)) ||
        (bankLineAmount.lessThan(0) && requestedAmount.greaterThan(0))
      ) {
        throw new BadRequestException("Match amount must align with the bank GL line direction");
      }
      if (requestedAmount.abs().greaterThan(remainingHeader.abs())) {
        throw new ConflictException("Match amount exceeds remaining GL bank line balance");
      }

      let match;
      try {
        match = await tx.reconciliationMatch.create({
          data: {
            reconciliationSessionId: session.id,
            bankTransactionId: bankTransaction.id,
            glHeaderId: glHeader.id,
            matchType: input.matchType ?? "MANUAL",
            amount: requestedAmount,
          },
          include: { bankTransaction: true, glHeader: true },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictException("Bank transaction is already matched");
        }
        throw err;
      }

      const newMatchedTotal = matchedForTxn.add(requestedAmount);
      const fullyMatched = round2(newMatchedTotal).equals(txnAmount);
      await tx.bankTransaction.update({
        where: { id: bankTransaction.id },
        data: { matched: fullyMatched },
      });

      return match;
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "RECONCILIATION_MATCH",
      entityId: match.id,
      action: AuditAction.CREATE,
      after: match,
    });

    return match;
  }

  async closeSession(orgId?: string, sessionId?: string, actorUserId?: string, input?: ReconciliationCloseInput) {
    if (!orgId || !sessionId) {
      throw new NotFoundException("Reconciliation session not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const existing = await this.prisma.reconciliationSession.findFirst({
      where: { id: sessionId, orgId },
    });
    if (!existing) {
      throw new NotFoundException("Reconciliation session not found");
    }
    if (existing.status === "CLOSED") {
      throw new ConflictException("Reconciliation session is already closed");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const statementClosingBalance =
        input.statementClosingBalance !== undefined
          ? round2(input.statementClosingBalance)
          : existing.statementClosingBalance;
      const matchedTransactions = await tx.reconciliationMatch.findMany({
        where: { reconciliationSessionId: sessionId },
        select: { amount: true },
      });
      const matchedTotal = matchedTransactions.reduce((total, match) => total.add(match.amount ?? 0), dec(0));
      const statementDifference = round2(
        dec(existing.statementOpeningBalance).add(matchedTotal).sub(statementClosingBalance),
      );
      if (!statementDifference.equals(0)) {
        throw new ConflictException(
          `Reconciliation session is not balanced (difference ${statementDifference.toFixed(2)})`,
        );
      }

      return tx.reconciliationSession.update({
        where: { id: sessionId },
        data: {
          status: "CLOSED",
          statementClosingBalance,
        },
      });
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "RECONCILIATION_SESSION",
      entityId: sessionId,
      action: AuditAction.UPDATE,
      before: existing,
      after: updated,
    });

    return updated;
  }
}
