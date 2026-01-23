import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { GLHeader, GLLine, Prisma } from "@prisma/client";
import { ErrorCodes } from "@ledgerlite/shared";
import { assertGlLinesValid } from "./gl-invariants";

type GlHeaderWithLines = GLHeader & { lines: GLLine[]; reversedBy?: (GLHeader & { lines: GLLine[] }) | null };

export type GlReversalResult = {
  originalHeader: GlHeaderWithLines;
  reversalHeader: GLHeader & { lines: GLLine[] };
};

export const createGlReversal = async (
  tx: Prisma.TransactionClient,
  headerId: string,
  actorUserId: string,
  options?: { memo?: string; reversalDate?: Date },
): Promise<GlReversalResult> => {
  const header = await tx.gLHeader.findUnique({
    where: { id: headerId },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      reversedBy: { include: { lines: { orderBy: { lineNo: "asc" } } } },
    },
  });

  if (!header) {
    throw new NotFoundException("GL header not found");
  }

  if (header.reversedBy) {
    return {
      originalHeader: header,
      reversalHeader: header.reversedBy,
    };
  }

  if (header.status !== "POSTED") {
    throw new ConflictException({
      code: ErrorCodes.CONFLICT,
      message: "GL header is not posted",
      hint: "Only posted headers can be reversed.",
    });
  }

  if (!header.lines.length) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "GL header has no lines to reverse",
      hint: "Check the ledger entries for this document.",
    });
  }

  const reversalLines = header.lines.map((line) => ({
    lineNo: line.lineNo,
    accountId: line.accountId,
    debit: line.credit,
    credit: line.debit,
    description: line.description ?? undefined,
    customerId: line.customerId ?? undefined,
    vendorId: line.vendorId ?? undefined,
    taxCodeId: line.taxCodeId ?? undefined,
  }));

  const totals = assertGlLinesValid(reversalLines);
  const reversalDate = options?.reversalDate ?? new Date();
  const memo = options?.memo ?? (header.memo ? `Reversal of ${header.memo}` : "Reversal entry");

  const reversalHeader = await tx.gLHeader.create({
    data: {
      orgId: header.orgId,
      sourceType: header.sourceType,
      sourceId: `REVERSAL:${header.id}`,
      postingDate: reversalDate,
      currency: header.currency,
      exchangeRate: header.exchangeRate,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      status: "POSTED",
      createdByUserId: actorUserId,
      memo,
      lines: {
        createMany: {
          data: reversalLines.map((line) => ({
            lineNo: line.lineNo,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description ?? undefined,
            customerId: line.customerId ?? undefined,
            vendorId: line.vendorId ?? undefined,
            taxCodeId: line.taxCodeId ?? undefined,
          })),
        },
      },
    },
    include: { lines: true },
  });

  const updatedOriginal = await tx.gLHeader.update({
    where: { id: header.id },
    data: {
      status: "REVERSED",
      reversedByHeaderId: reversalHeader.id,
    },
    include: { lines: true },
  });

  return {
    originalHeader: { ...updatedOriginal, reversedBy: reversalHeader },
    reversalHeader,
  };
};
