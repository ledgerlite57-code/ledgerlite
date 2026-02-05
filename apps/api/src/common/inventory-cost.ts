import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MoneyValue } from "./money";
import { dec, round2 } from "./money";

const roundQty = (value: Prisma.Decimal | number | string) => dec(value).toDecimalPlaces(4);
const roundUnitCost = (value: Prisma.Decimal | number | string) => dec(value).toDecimalPlaces(6);

export type InventoryCostItem = {
  id: string;
  trackInventory: boolean;
  type: string;
  unitOfMeasureId: string | null;
  expenseAccountId: string;
  inventoryAccountId: string | null;
  purchasePrice: Prisma.Decimal | null;
};

export type InventoryCostLine = {
  lineId: string;
  itemId: string;
  expenseAccountId: string;
  inventoryAccountId: string;
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
  effectiveAt: Date;
  useEffectiveDateCutoff?: boolean;
  lines: Array<{ id: string; itemId: string | null; qty: Prisma.Decimal; unitOfMeasureId: string | null }>;
  itemsById: Map<string, InventoryCostItem>;
}) => {
  const useEffectiveDateCutoff = params.useEffectiveDateCutoff ?? true;

  const trackedItems = Array.from(params.itemsById.values()).filter(
    (item) => item.trackInventory && item.type === "INVENTORY",
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
      costByItemId.set(item.id, roundUnitCost(purchasePrice));
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
      select: {
        id: true,
        itemId: true,
        quantity: true,
        unitCost: true,
        createdAt: true,
        effectiveAt: true,
      },
    });

    const totals = new Map<string, { qty: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const movement of movements) {
      const effectiveAt = movement.effectiveAt ?? movement.createdAt;
      if (useEffectiveDateCutoff && effectiveAt > params.effectiveAt) {
        continue;
      }

      const qty = dec(movement.quantity);
      const unitCost = dec(movement.unitCost ?? 0);
      if (!qty.greaterThan(0) || !unitCost.greaterThan(0)) {
        continue;
      }
      const current = totals.get(movement.itemId) ?? { qty: dec(0), cost: dec(0) };
      totals.set(movement.itemId, {
        // Keep quantity math at inventory precision (4 dp) to avoid losing tiny fractional quantities.
        qty: roundQty(dec(current.qty).add(qty)),
        // Keep higher precision while accumulating cost; round only when deriving unit cost.
        cost: dec(current.cost).add(qty.mul(unitCost)),
      });
    }

    for (const itemId of missingCostItemIds) {
      const total = totals.get(itemId);
      if (total && dec(total.qty).greaterThan(0)) {
        costByItemId.set(itemId, roundUnitCost(dec(total.cost).div(total.qty)));
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
    if (!item || !item.trackInventory || item.type !== "INVENTORY") {
      continue;
    }
    if (!item.inventoryAccountId) {
      throw new BadRequestException("Inventory account is missing for one or more items");
    }
    if (!item.expenseAccountId) {
      throw new BadRequestException("COGS account is missing for one or more items");
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
    const totalCost = dec(unitCost).mul(dec(qtyBase).abs());
    if (totalCost.equals(0)) {
      continue;
    }
    costLines.push({
      lineId: line.id,
      itemId: item.id,
      expenseAccountId: item.expenseAccountId,
      inventoryAccountId: item.inventoryAccountId,
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
  description: string;
  customerId?: string | null;
  direction: "ISSUE" | "RETURN";
  startingLineNo: number;
}) => {
  if (!params.costLines.length) {
    return { lines: [] as InventoryPostingLine[], totalDebit: dec(0), totalCredit: dec(0) };
  }

  const totalsByExpense = new Map<string, Prisma.Decimal>();
  const totalsByInventory = new Map<string, Prisma.Decimal>();
  let totalPrecise = dec(0);
  for (const line of params.costLines) {
    totalPrecise = dec(totalPrecise).add(line.totalCost);
    const current = totalsByExpense.get(line.expenseAccountId) ?? dec(0);
    totalsByExpense.set(line.expenseAccountId, dec(current).add(line.totalCost));
    const currentInventory = totalsByInventory.get(line.inventoryAccountId) ?? dec(0);
    totalsByInventory.set(line.inventoryAccountId, dec(currentInventory).add(line.totalCost));
  }

  const totalCost = round2(totalPrecise);
  if (totalCost.equals(0)) {
    return { lines: [] as InventoryPostingLine[], totalDebit: dec(0), totalCredit: dec(0) };
  }

  type RoundedAccountTotal = { accountId: string; amount: Prisma.Decimal };
  const roundAccountTotals = (totals: Map<string, Prisma.Decimal>, targetTotal: Prisma.Decimal) => {
    const sorted = Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b));
    const rounded = sorted.map(([accountId, amount]) => ({
      accountId,
      amount: round2(amount),
    }));
    const sumRounded = rounded.reduce((sum: Prisma.Decimal, row) => dec(sum).add(row.amount), dec(0));
    const remainder = round2(dec(targetTotal).sub(sumRounded));
    if (!remainder.equals(0) && rounded.length > 0) {
      let idx = 0;
      for (let i = 1; i < rounded.length; i += 1) {
        if (rounded[i].amount.abs().greaterThan(rounded[idx].amount.abs())) {
          idx = i;
        }
      }
      rounded[idx] = {
        accountId: rounded[idx].accountId,
        amount: round2(dec(rounded[idx].amount).add(remainder)),
      };
    }
    return rounded.filter((row) => !row.amount.equals(0)) as RoundedAccountTotal[];
  };

  const expenseTotals = roundAccountTotals(totalsByExpense, totalCost);
  const inventoryTotals = roundAccountTotals(totalsByInventory, totalCost);

  const lines: InventoryPostingLine[] = [];
  let lineNo = params.startingLineNo;

  if (params.direction === "ISSUE") {
    for (const { accountId, amount } of expenseTotals) {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: amount,
        credit: dec(0),
        description: params.description,
        customerId: params.customerId ?? undefined,
      });
    }
    for (const { accountId, amount } of inventoryTotals) {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: dec(0),
        credit: amount,
        description: params.description,
      });
    }
  } else {
    for (const { accountId, amount } of inventoryTotals) {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: amount,
        credit: dec(0),
        description: params.description,
      });
    }
    for (const { accountId, amount } of expenseTotals) {
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
