import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { GLSourceType } from "@prisma/client";
import { ErrorCodes } from "@ledgerlite/shared";
import type { MoneyValue } from "./money";
import { dec, round2 } from "./money";
import { assertMoneyEq, assertNonNegativeDecimal } from "./money-invariants";

export type GlLineInvariantInput = {
  debit: MoneyValue;
  credit: MoneyValue;
  lineNo?: number;
};

export const assertGlLinesValid = (lines: GlLineInvariantInput[]) => {
  if (!lines || lines.length === 0) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "GL lines are required",
      hint: "Provide at least one posting line.",
    });
  }

  let totalDebit = dec(0);
  let totalCredit = dec(0);

  lines.forEach((line, index) => {
    const lineNo = line.lineNo ?? index + 1;
    const debit = round2(line.debit);
    const credit = round2(line.credit);

    assertNonNegativeDecimal(debit, `Line ${lineNo} debit`);
    assertNonNegativeDecimal(credit, `Line ${lineNo} credit`);

    const hasDebit = debit.greaterThan(0);
    const hasCredit = credit.greaterThan(0);

    if (hasDebit === hasCredit) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: `Line ${lineNo} must include either a debit or credit amount`,
        hint: "Set one side to zero.",
      });
    }

    totalDebit = dec(totalDebit).add(debit);
    totalCredit = dec(totalCredit).add(credit);
  });

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  assertMoneyEq(totalDebit, totalCredit, "GL totals");

  return { totalDebit, totalCredit };
};

export const assertGlHeaderSourceUnique = async (
  client: Prisma.TransactionClient,
  orgId: string,
  sourceType: GLSourceType,
  sourceId: string,
) => {
  const existing = await client.gLHeader.findFirst({
    where: { orgId, sourceType, sourceId },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictException({
      code: ErrorCodes.CONFLICT,
      message: "GL header already exists for this source",
      hint: "This document may already be posted.",
      details: { sourceType, sourceId },
    });
  }
};
