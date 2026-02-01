import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MoneyValue } from "./money";
import { dec, round2 } from "./money";

export type InventoryCostItem = {
  id: string;
  trackInventory: boolean;
  type: string;
  unitOfMeasureId: string | null;
  expenseAccountId: string;
  purchasePrice: Prisma.Decimal | null;
};

export type InventoryCostLine = {
  lineId: string;
  itemId: string;
  expenseAccountId: string;
  baseQty: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
};

export type InventoryPostingLine = {
  lineNo: number;
  accountId: string;
  debit: MoneyValue;
  credit: MoneyValue;
  description?: string | null;
  customerId?: string | null;
  taxCodeId?: string | null;
};

export const resolveInventoryCostLines = async (params: {
  tx: Prisma.TransactionClient;
  orgId: string;
  lines: Array<{ id: string; itemId: string | null; qty: Prisma.Decimal; unitOfMeasureId: string | null }>;
  itemsById: Map<string, InventoryCostItem>;
}) => {
  const trackedItems = Array.from(params.itemsById.values()).filter(
    (item) => item.trackInventory && item.type === "PRODUCT",
  );
  if (trackedItems.length === 0) {
    return { costLines: [] as InventoryCostLine[], unitCostByLineId: new Map<string, Prisma.Decimal>() };
  }

  const unitIds = Array.from(
    new Set(
      params.lines
        .map((line) => (line.itemId ? line.unitOfMeasureId ?? params.itemsById.get(line.itemId)?.unitOfMeasureId : null))
        .filter(Boolean),
    ),
  ) as string[];
  const units = unitIds.length
    ? await params.tx.unitOfMeasure.findMany({
        where: { orgId: params.orgId, id: { in: unitIds } },
        select: { id: true, baseUnitId: true, conversionRate: true },
      })
    : [];
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  const costByItemId = new Map<string, Prisma.Decimal>();
  const missingCostItemIds: string[] = [];
  for (const item of trackedItems) {
    const purchasePrice = item.purchasePrice ? dec(item.purchasePrice) : null;
    if (purchasePrice && purchasePrice.greaterThan(0)) {
      costByItemId.set(item.id, round2(purchasePrice));
    } else {
      missingCostItemIds.push(item.id);
    }
  }

  if (missingCostItemIds.length > 0) {
    const movements = await params.tx.inventoryMovement.findMany({
      where: {
        orgId: params.orgId,
        itemId: { in: missingCostItemIds },
        unitCost: { not: null },
        quantity: { gt: 0 },
      },
      select: { itemId: true, quantity: true, unitCost: true },
    });

    const totals = new Map<string, { qty: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const movement of movements) {
      const qty = dec(movement.quantity);
      const unitCost = dec(movement.unitCost ?? 0);
      if (!qty.greaterThan(0) || !unitCost.greaterThan(0)) {
        continue;
      }
      const current = totals.get(movement.itemId) ?? { qty: dec(0), cost: dec(0) };
      totals.set(movement.itemId, {
        qty: round2(dec(current.qty).add(qty)),
        cost: round2(dec(current.cost).add(qty.mul(unitCost))),
      });
    }

    for (const itemId of missingCostItemIds) {
      const total = totals.get(itemId);
      if (total && dec(total.qty).greaterThan(0)) {
        costByItemId.set(itemId, round2(dec(total.cost).div(total.qty)));
      }
    }
  }

  const missing = missingCostItemIds.filter((itemId) => !costByItemId.has(itemId));
  if (missing.length > 0) {
    throw new BadRequestException("Inventory cost is missing for one or more items");
  }

  const costLines: InventoryCostLine[] = [];
  for (const line of params.lines) {
    if (!line.itemId) {
      continue;
    }
    const item = params.itemsById.get(line.itemId);
    if (!item || !item.trackInventory || item.type !== "PRODUCT") {
      continue;
    }
    const unitId = line.unitOfMeasureId ?? item.unitOfMeasureId ?? undefined;
    const unit = unitId ? unitsById.get(unitId) : undefined;
    const conversion = unit && unit.baseUnitId ? dec(unit.conversionRate ?? 1) : dec(1);
    const qtyBase = dec(line.qty).mul(conversion);
    if (qtyBase.equals(0)) {
      continue;
    }
    const unitCost = costByItemId.get(item.id);
    if (!unitCost) {
      continue;
    }
    const totalCost = round2(dec(unitCost).mul(dec(qtyBase).abs()));
    if (totalCost.equals(0)) {
      continue;
    }
    costLines.push({
      lineId: line.id,
      itemId: item.id,
      expenseAccountId: item.expenseAccountId,
      baseQty: qtyBase,
      unitCost,
      totalCost,
    });
  }

  return {
    costLines,
    unitCostByLineId: new Map(costLines.map((line) => [line.lineId, line.unitCost])),
  };
};

export const buildInventoryCostPostingLines = (params: {
  costLines: InventoryCostLine[];
  inventoryAccountId: string;
  description: string;
  customerId?: string | null;
  direction: "ISSUE" | "RETURN";
  startingLineNo: number;
}) => {
  if (!params.costLines.length) {
    return { lines: [] as InventoryPostingLine[], totalDebit: dec(0), totalCredit: dec(0) };
  }

  const totalsByExpense = new Map<string, Prisma.Decimal>();
  for (const line of params.costLines) {
    const current = totalsByExpense.get(line.expenseAccountId) ?? dec(0);
    totalsByExpense.set(line.expenseAccountId, round2(dec(current).add(line.totalCost)));
  }

  const sortedExpense = Array.from(totalsByExpense.entries()).sort(([a], [b]) => a.localeCompare(b));
  const totalCost = round2(sortedExpense.reduce((sum, [, amount]) => dec(sum).add(amount), dec(0)));
  if (totalCost.equals(0)) {
    return { lines: [] as InventoryPostingLine[], totalDebit: dec(0), totalCredit: dec(0) };
  }

  const lines: InventoryPostingLine[] = [];
  let lineNo = params.startingLineNo;

  if (params.direction === "ISSUE") {
    for (const [accountId, amount] of sortedExpense) {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: amount,
        credit: dec(0),
        description: params.description,
        customerId: params.customerId ?? undefined,
      });
    }
    lines.push({
      lineNo: lineNo++,
      accountId: params.inventoryAccountId,
      debit: dec(0),
      credit: totalCost,
      description: params.description,
    });
  } else {
    lines.push({
      lineNo: lineNo++,
      accountId: params.inventoryAccountId,
      debit: totalCost,
      credit: dec(0),
      description: params.description,
    });
    for (const [accountId, amount] of sortedExpense) {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: dec(0),
        credit: amount,
        description: params.description,
        customerId: params.customerId ?? undefined,
      });
    }
  }

  const totalDebit = round2(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = round2(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
};
