import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, ReconciliationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { round2 } from "../../common/money";
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

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
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

    const session = await this.prisma.reconciliationSession.findFirst({
      where: { id: sessionId, orgId },
    });
    if (!session) {
      throw new NotFoundException("Reconciliation session not found");
    }
    if (session.status === "CLOSED") {
      throw new ConflictException("Reconciliation session is closed");
    }

    const bankTransaction = await this.prisma.bankTransaction.findFirst({
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

    const glHeader = await this.prisma.gLHeader.findFirst({
      where: { id: input.glHeaderId, orgId },
    });
    if (!glHeader) {
      throw new NotFoundException("GL header not found");
    }

    let match;
    try {
      match = await this.prisma.reconciliationMatch.create({
        data: {
          reconciliationSessionId: session.id,
          bankTransactionId: bankTransaction.id,
          glHeaderId: glHeader.id,
          matchType: input.matchType ?? "MANUAL",
        },
        include: { bankTransaction: true, glHeader: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Bank transaction is already matched");
      }
      throw err;
    }

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

    const updated = await this.prisma.reconciliationSession.update({
      where: { id: sessionId },
      data: {
        status: "CLOSED",
        statementClosingBalance:
          input.statementClosingBalance !== undefined
            ? round2(input.statementClosingBalance)
            : existing.statementClosingBalance,
      },
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
