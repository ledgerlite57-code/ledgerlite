import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "@ledgerlite/shared";
import type { Prisma } from "@prisma/client";
import { dec } from "./money";

export type NegativeStockPolicy = "ALLOW" | "WARN" | "BLOCK";

export type NegativeStockIssue = {
  itemId: string;
  onHandQty: Prisma.Decimal;
  issueQty: Prisma.Decimal;
  projectedQty: Prisma.Decimal;
};

export const serializeNegativeStockIssues = (issues: NegativeStockIssue[]) =>
  issues.map((issue) => ({
    itemId: issue.itemId,
    onHandQty: issue.onHandQty.toString(),
    issueQty: issue.issueQty.toString(),
    projectedQty: issue.projectedQty.toString(),
  }));

export const normalizeNegativeStockPolicy = (value?: string | null): NegativeStockPolicy => {
  const normalized = value?.toUpperCase();
  if (normalized === "BLOCK" || normalized === "WARN" || normalized === "ALLOW") {
    return normalized;
  }
  return "ALLOW";
};

export const detectNegativeStockIssues = (entries: Array<{ itemId: string; onHandQty: Prisma.Decimal.Value; issueQty: Prisma.Decimal.Value }>) => {
  const issues: NegativeStockIssue[] = [];
  for (const entry of entries) {
    const onHandQty = dec(entry.onHandQty);
    const issueQty = dec(entry.issueQty).abs();
    const projectedQty = dec(onHandQty).sub(issueQty);
    if (projectedQty.lessThan(0)) {
      issues.push({
        itemId: entry.itemId,
        onHandQty,
        issueQty,
        projectedQty,
      });
    }
  }
  return issues;
};

export const assertNegativeStockPolicy = (policy: NegativeStockPolicy, issues: NegativeStockIssue[]) => {
  if (policy !== "BLOCK" || issues.length === 0) {
    return;
  }

  throw new BadRequestException({
    code: ErrorCodes.VALIDATION_ERROR,
    message: "Posting would result in negative stock for one or more items",
    hint: "Adjust quantities or switch negative stock policy before posting.",
    details: {
      policy,
      items: serializeNegativeStockIssues(issues),
    },
  });
};
