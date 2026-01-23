import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, DocumentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { hashRequestBody } from "../../common/idempotency";
import { RequestContext } from "../../logging/request-context";
import { calculateJournalTotals, ensureValidJournalLines } from "../../journals.utils";
import { round2 } from "../../common/money";
import type { JournalCreateInput, JournalLineCreateInput, JournalUpdateInput, PaginationInput } from "@ledgerlite/shared";
import { toEndOfDayUtc, toStartOfDayUtc } from "../../common/date-range";
import { ensureBaseCurrencyOnly } from "../../common/currency-policy";
import { assertGlLinesValid } from "../../common/gl-invariants";
import { ensureNotLocked, isDateLocked } from "../../common/lock-date";
import { createGlReversal } from "../../common/gl-reversal";

type JournalRecord = Prisma.JournalEntryGetPayload<{
  include: { lines: true };
}>;

type JournalListParams = PaginationInput & { status?: string; dateFrom?: Date; dateTo?: Date };

@Injectable()
export class JournalsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listJournals(orgId?: string, params?: JournalListParams) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const where: Prisma.JournalEntryWhereInput = { orgId };

    if (params?.status) {
      const normalized = params.status.toUpperCase();
      if (Object.values(DocumentStatus).includes(normalized as DocumentStatus)) {
        where.status = normalized as DocumentStatus;
      }
    }

    if (params?.q) {
      where.OR = [
        { number: { contains: params.q, mode: "insensitive" } },
        { memo: { contains: params.q, mode: "insensitive" } },
      ];
    }
    if (params?.dateFrom || params?.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (params.dateFrom) {
        dateFilter.gte = toStartOfDayUtc(params.dateFrom);
      }
      if (params.dateTo) {
        dateFilter.lte = toEndOfDayUtc(params.dateTo);
      }
      where.journalDate = dateFilter;
    }

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: { journalDate: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.journalEntry.count({ where }),
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

  async getJournal(orgId?: string, journalId?: string) {
    if (!orgId || !journalId) {
      throw new NotFoundException("Journal not found");
    }

    const journal = await this.prisma.journalEntry.findFirst({
      where: { id: journalId, orgId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });

    if (!journal) {
      throw new NotFoundException("Journal not found");
    }

    return journal;
  }

  async createJournal(
    orgId?: string,
    actorUserId?: string,
    input?: JournalCreateInput,
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
        return existingKey.response as unknown as JournalRecord;
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const normalizedLines = this.normalizeLines(input.lines);
    ensureValidJournalLines(normalizedLines);
    await this.validateLineReferences(orgId, input.lines);

    const journalDate = new Date(input.journalDate);

    const journal = await this.prisma.journalEntry.create({
      data: {
        orgId,
        status: "DRAFT",
        journalDate,
        memo: input.memo,
        createdByUserId: actorUserId,
        lines: {
          createMany: {
            data: normalizedLines.map((line) => ({
              lineNo: line.lineNo,
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: line.description ?? undefined,
              customerId: line.customerId ?? undefined,
              vendorId: line.vendorId ?? undefined,
            })),
          },
        },
      },
      include: { lines: true },
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "JOURNAL",
      entityId: journal.id,
      action: AuditAction.CREATE,
      after: journal,
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: journal as unknown as object,
          statusCode: 201,
        },
      });
    }

    return journal;
  }

  async updateJournal(orgId?: string, journalId?: string, actorUserId?: string, input?: JournalUpdateInput) {
    if (!orgId || !journalId) {
      throw new NotFoundException("Journal not found");
    }
    if (!input) {
      throw new BadRequestException("Missing payload");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.journalEntry.findFirst({
        where: { id: journalId, orgId },
        include: { lines: true },
      });
      if (!existing) {
        throw new NotFoundException("Journal not found");
      }
      if (existing.status !== "DRAFT") {
        throw new ConflictException("Posted journals cannot be edited");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const journalDate = input.journalDate ? new Date(input.journalDate) : existing.journalDate;
      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, journalDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "JOURNAL",
          entityId: journalId,
          action: AuditAction.UPDATE,
          before: { status: existing.status, journalDate: existing.journalDate },
          after: {
            blockedAction: "update journal",
            docDate: journalDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, journalDate, "update journal");

      if (input.lines) {
        const normalizedLines = this.normalizeLines(input.lines);
        ensureValidJournalLines(normalizedLines);
        await this.validateLineReferences(orgId, input.lines, tx);

        await tx.journalLine.deleteMany({ where: { journalEntryId: journalId } });
        await tx.journalLine.createMany({
          data: normalizedLines.map((line) => ({
            journalEntryId: journalId,
            lineNo: line.lineNo,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description ?? undefined,
            customerId: line.customerId ?? undefined,
            vendorId: line.vendorId ?? undefined,
          })),
        });
      }

      const updated = await tx.journalEntry.update({
        where: { id: journalId },
        data: {
          journalDate,
          memo: input.memo ?? existing.memo,
        },
      });

      const after = await tx.journalEntry.findFirst({
        where: { id: journalId, orgId },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });

      return { before: existing, after: after ?? updated };
    });

    await this.audit.log({
      orgId,
      actorUserId,
      entityType: "JOURNAL",
      entityId: journalId,
      action: AuditAction.UPDATE,
      before: result.before,
      after: result.after,
    });

    return result.after;
  }

  async postJournal(orgId?: string, journalId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !journalId) {
      throw new NotFoundException("Journal not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const requestHash = idempotencyKey ? hashRequestBody({ journalId }) : null;
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

    let result: { journal: object; glHeader: object };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const journal = await tx.journalEntry.findFirst({
          where: { id: journalId, orgId },
          include: { lines: { orderBy: { lineNo: "asc" } } },
        });

        if (!journal) {
          throw new NotFoundException("Journal not found");
        }
        if (journal.status !== "DRAFT") {
          throw new ConflictException("Journal is already posted");
        }
        if (journal.lines.length === 0) {
          throw new BadRequestException("Journal must include lines");
        }

        const org = await tx.organization.findUnique({
          where: { id: orgId },
          include: { orgSettings: true },
        });
        if (!org) {
          throw new NotFoundException("Organization not found");
        }
        const lockDate = org.orgSettings?.lockDate ?? null;
        if (isDateLocked(lockDate, journal.journalDate)) {
          await this.audit.log({
            orgId,
            actorUserId,
            entityType: "JOURNAL",
            entityId: journal.id,
            action: AuditAction.UPDATE,
            before: { status: journal.status, journalDate: journal.journalDate },
            after: {
              blockedAction: "post journal",
              docDate: journal.journalDate.toISOString(),
              lockDate: lockDate ? lockDate.toISOString() : null,
            },
          });
        }
        ensureNotLocked(lockDate, journal.journalDate, "post journal");

        const baseCurrency = org.baseCurrency;
        ensureBaseCurrencyOnly(baseCurrency, baseCurrency);

        await this.validateLineReferences(orgId, journal.lines, tx);
        const normalizedLines = journal.lines.map((line) => ({
          lineNo: line.lineNo,
          accountId: line.accountId,
          debit: round2(line.debit),
          credit: round2(line.credit),
          description: line.description ?? undefined,
          customerId: line.customerId ?? undefined,
          vendorId: line.vendorId ?? undefined,
        }));

        ensureValidJournalLines(normalizedLines);
        assertGlLinesValid(normalizedLines);

        const totals = calculateJournalTotals(normalizedLines);

        const updatedJournal = await tx.journalEntry.update({
          where: { id: journalId },
          data: {
            status: "POSTED",
            postedAt: new Date(),
          },
        });

        const glHeader = await tx.gLHeader.create({
          data: {
            orgId,
            sourceType: "JOURNAL",
            sourceId: journal.id,
            postingDate: journal.journalDate,
            currency: baseCurrency!,
            exchangeRate: null,
            totalDebit: totals.totalDebit,
            totalCredit: totals.totalCredit,
            status: "POSTED",
            createdByUserId: actorUserId,
            memo: journal.memo ?? "Journal entry",
            lines: {
              createMany: {
                data: normalizedLines.map((line) => ({
                  lineNo: line.lineNo,
                  accountId: line.accountId,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description ?? undefined,
                  customerId: line.customerId ?? undefined,
                  vendorId: line.vendorId ?? undefined,
                })),
              },
            },
          },
          include: { lines: true },
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorUserId,
            entityType: "JOURNAL",
            entityId: journal.id,
            action: AuditAction.POST,
            before: journal,
            after: updatedJournal,
            requestId: RequestContext.get()?.requestId,
          },
        });

        const response = {
          journal: {
            ...updatedJournal,
            lines: journal.lines,
          },
          glHeader,
        };

        return response;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Journal is already posted");
      }
      throw err;
    }

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 201,
        },
      });
    }

    return result;
  }

  async voidJournal(orgId?: string, journalId?: string, actorUserId?: string, idempotencyKey?: string) {
    if (!orgId || !journalId) {
      throw new NotFoundException("Journal not found");
    }
    if (!actorUserId) {
      throw new ConflictException("Missing user context");
    }

    const requestHash = idempotencyKey ? hashRequestBody({ journalId, action: "VOID" }) : null;
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

    const result = await this.prisma.$transaction(async (tx) => {
      const journal = await tx.journalEntry.findFirst({
        where: { id: journalId, orgId },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });

      if (!journal) {
        throw new NotFoundException("Journal not found");
      }

      const glHeader = await tx.gLHeader.findUnique({
        where: {
          orgId_sourceType_sourceId: {
            orgId,
            sourceType: "JOURNAL",
            sourceId: journal.id,
          },
        },
        include: {
          lines: true,
          reversedBy: { include: { lines: true } },
        },
      });

      if (journal.status === "VOID") {
        if (!glHeader?.reversedBy) {
          throw new ConflictException("Journal is already voided");
        }
        return {
          journal,
          reversalHeader: glHeader.reversedBy,
        };
      }

      if (journal.status !== "POSTED") {
        throw new ConflictException("Only posted journals can be voided");
      }

      const org = await tx.organization.findUnique({
        where: { id: orgId },
        include: { orgSettings: true },
      });
      if (!org) {
        throw new NotFoundException("Organization not found");
      }

      const lockDate = org.orgSettings?.lockDate ?? null;
      if (isDateLocked(lockDate, journal.journalDate)) {
        await this.audit.log({
          orgId,
          actorUserId,
          entityType: "JOURNAL",
          entityId: journal.id,
          action: AuditAction.UPDATE,
          before: { status: journal.status, journalDate: journal.journalDate },
          after: {
            blockedAction: "void journal",
            docDate: journal.journalDate.toISOString(),
            lockDate: lockDate ? lockDate.toISOString() : null,
          },
        });
      }
      ensureNotLocked(lockDate, journal.journalDate, "void journal");

      if (!glHeader) {
        throw new ConflictException("Ledger header is missing for this journal");
      }

      const { reversalHeader } = await createGlReversal(tx, glHeader.id, actorUserId, {
        memo: `Void journal ${journal.number ?? journal.id}`,
        reversalDate: new Date(),
      });

      const updatedJournal = await tx.journalEntry.update({
        where: { id: journalId },
        data: {
          status: "VOID",
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId,
          entityType: "JOURNAL",
          entityId: journal.id,
          action: AuditAction.VOID,
          before: journal,
          after: updatedJournal,
          requestId: RequestContext.get()?.requestId,
        },
      });

      return {
        journal: {
          ...updatedJournal,
          lines: journal.lines,
        },
        reversalHeader,
      };
    });

    if (idempotencyKey && requestHash) {
      await this.prisma.idempotencyKey.create({
        data: {
          orgId,
          key: idempotencyKey,
          requestHash,
          response: result as unknown as object,
          statusCode: 200,
        },
      });
    }

    return result;
  }

  private normalizeLines(lines: JournalLineCreateInput[]) {
    return lines.map((line, index) => ({
      lineNo: index + 1,
      accountId: line.accountId,
      debit: round2(line.debit ?? 0),
      credit: round2(line.credit ?? 0),
      description: line.description ?? undefined,
      customerId: line.customerId ?? undefined,
      vendorId: line.vendorId ?? undefined,
    }));
  }

  private async validateLineReferences(
    orgId: string,
    lines: Array<{ accountId: string; customerId?: string | null; vendorId?: string | null }>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const accountIds = Array.from(new Set(lines.map((line) => line.accountId)));
    const customerIds = Array.from(new Set(lines.map((line) => line.customerId).filter(Boolean))) as string[];
    const vendorIds = Array.from(new Set(lines.map((line) => line.vendorId).filter(Boolean))) as string[];

    for (const line of lines) {
      if (line.customerId && line.vendorId) {
        throw new BadRequestException("Select either a customer or vendor, not both");
      }
    }

    if (accountIds.length > 0) {
      const accounts = await client.account.findMany({
        where: { orgId, id: { in: accountIds }, isActive: true },
        select: { id: true },
      });
      if (accounts.length !== accountIds.length) {
        throw new BadRequestException("Account is missing or inactive");
      }
    }

    if (customerIds.length > 0) {
      const customers = await client.customer.findMany({
        where: { orgId, id: { in: customerIds }, isActive: true },
        select: { id: true },
      });
      if (customers.length !== customerIds.length) {
        throw new BadRequestException("Customer is missing or inactive");
      }
    }

    if (vendorIds.length > 0) {
      const vendors = await client.vendor.findMany({
        where: { orgId, id: { in: vendorIds }, isActive: true },
        select: { id: true },
      });
      if (vendors.length !== vendorIds.length) {
        throw new BadRequestException("Vendor is missing or inactive");
      }
    }
  }
}
