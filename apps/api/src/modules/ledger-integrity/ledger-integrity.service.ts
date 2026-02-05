import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { LedgerIntegrityQueryInput } from "@ledgerlite/shared";

type HeaderIntegrityIssue = {
  headerId: string;
  sourceType: string;
  sourceId: string;
  postingDate: Date | null;
  totalDebit: unknown;
  totalCredit: unknown;
  lineDebit: unknown;
  lineCredit: unknown;
};

type LineIntegrityIssue = {
  lineId: string;
  headerId: string;
  debit: unknown;
  credit: unknown;
};

@Injectable()
export class LedgerIntegrityService {
  private readonly logger = new Logger(LedgerIntegrityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async audit(orgId?: string, query?: LedgerIntegrityQueryInput) {
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    const limit = query?.limit ?? 200;

    const headerIssues = await this.prisma.$queryRaw<HeaderIntegrityIssue[]>`
      SELECT
        h."id" as "headerId",
        h."sourceType" as "sourceType",
        h."sourceId" as "sourceId",
        h."postingDate" as "postingDate",
        h."totalDebit" as "totalDebit",
        h."totalCredit" as "totalCredit",
        COALESCE(SUM(l."debit"), 0) as "lineDebit",
        COALESCE(SUM(l."credit"), 0) as "lineCredit"
      FROM "GLHeader" h
      LEFT JOIN "GLLine" l ON l."headerId" = h."id"
      WHERE h."orgId" = ${orgId}
      GROUP BY h."id"
      HAVING
        COALESCE(SUM(l."debit"), 0) <> h."totalDebit"
        OR COALESCE(SUM(l."credit"), 0) <> h."totalCredit"
        OR h."totalDebit" <> h."totalCredit"
      ORDER BY h."postingDate" DESC NULLS LAST
      LIMIT ${limit}
    `;

    const lineIssues = await this.prisma.$queryRaw<LineIntegrityIssue[]>`
      SELECT
        l."id" as "lineId",
        l."headerId" as "headerId",
        l."debit" as "debit",
        l."credit" as "credit"
      FROM "GLLine" l
      WHERE l."orgId" = ${orgId}
        AND (
          (l."debit" > 0 AND l."credit" > 0)
          OR (l."debit" = 0 AND l."credit" = 0)
        )
      ORDER BY l."createdAt" DESC NULLS LAST
      LIMIT ${limit}
    `;

    const issueCount = headerIssues.length + lineIssues.length;
    if (issueCount > 0) {
      this.logger.error(
        `Ledger integrity issues detected`,
        JSON.stringify({
          orgId,
          headerIssues: headerIssues.length,
          lineIssues: lineIssues.length,
        }),
      );
    }

    return {
      ok: issueCount === 0,
      totals: {
        headerIssues: headerIssues.length,
        lineIssues: lineIssues.length,
      },
      issues: {
        headers: headerIssues,
        lines: lineIssues,
      },
    };
  }
}
