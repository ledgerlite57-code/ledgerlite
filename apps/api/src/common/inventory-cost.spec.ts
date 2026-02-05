import { Prisma } from "@prisma/client";
import { buildInventoryCostPostingLines, resolveInventoryCostLines } from "./inventory-cost";
import { dec, toString2 } from "./money";

describe("inventory cost resolver", () => {
  const baseItem = {
    id: "item-1",
    trackInventory: true,
    type: "INVENTORY",
    unitOfMeasureId: null,
    expenseAccountId: "acct-cogs",
    inventoryAccountId: "acct-inv",
    purchasePrice: null,
  } as const;

  it("uses only inbound costs effective on or before the document date", async () => {
    const tx = {
      unitOfMeasure: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m-1",
            itemId: "item-1",
            quantity: new Prisma.Decimal("10"),
            unitCost: new Prisma.Decimal("4.00"),
            sourceType: "BILL",
            sourceId: "bill-old",
            effectiveAt: new Date("2025-01-10T00:00:00Z"),
            createdAt: new Date("2025-02-01T00:00:00Z"),
          },
          {
            id: "m-2",
            itemId: "item-1",
            quantity: new Prisma.Decimal("10"),
            unitCost: new Prisma.Decimal("8.00"),
            sourceType: "BILL",
            sourceId: "bill-new",
            effectiveAt: new Date("2025-02-20T00:00:00Z"),
            createdAt: new Date("2025-03-01T00:00:00Z"),
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await resolveInventoryCostLines({
      tx,
      orgId: "org-1",
      effectiveAt: new Date("2025-01-31T00:00:00Z"),
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          qty: new Prisma.Decimal("2"),
          unitOfMeasureId: null,
        },
      ],
      itemsById: new Map([[baseItem.id, baseItem]]),
    });

    expect(result.costLines).toHaveLength(1);
    expect(toString2(result.costLines[0]?.unitCost ?? 0)).toBe("4.00");
    expect(toString2(result.costLines[0]?.totalCost ?? 0)).toBe("8.00");
    expect(toString2(result.unitCostByLineId.get("line-1") ?? 0)).toBe("4.00");
  });

  it("uses movement effective dates to respect cutoffs", async () => {
    const tx = {
      unitOfMeasure: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m-old",
            itemId: "item-1",
            quantity: new Prisma.Decimal("1"),
            unitCost: new Prisma.Decimal("5.00"),
            sourceType: "ADJUSTMENT",
            sourceId: "adj-1",
            effectiveAt: new Date("2025-01-01T00:00:00Z"),
            createdAt: new Date("2025-01-01T00:00:00Z"),
          },
          {
            id: "m-new",
            itemId: "item-1",
            quantity: new Prisma.Decimal("1"),
            unitCost: new Prisma.Decimal("9.00"),
            sourceType: "ADJUSTMENT",
            sourceId: "adj-2",
            effectiveAt: new Date("2025-03-01T00:00:00Z"),
            createdAt: new Date("2025-03-01T00:00:00Z"),
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await resolveInventoryCostLines({
      tx,
      orgId: "org-1",
      effectiveAt: new Date("2025-02-01T00:00:00Z"),
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          qty: new Prisma.Decimal("1"),
          unitOfMeasureId: null,
        },
      ],
      itemsById: new Map([[baseItem.id, baseItem]]),
    });

    expect(result.costLines).toHaveLength(1);
    expect(toString2(result.costLines[0]?.unitCost ?? 0)).toBe("5.00");
  });

  it("can disable effective-date cutoff via feature flag input", async () => {
    const tx = {
      unitOfMeasure: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m-1",
            itemId: "item-1",
            quantity: new Prisma.Decimal("1"),
            unitCost: new Prisma.Decimal("4.00"),
            sourceType: "BILL",
            sourceId: "bill-old",
            effectiveAt: new Date("2025-01-10T00:00:00Z"),
            createdAt: new Date("2025-01-01T00:00:00Z"),
          },
          {
            id: "m-2",
            itemId: "item-1",
            quantity: new Prisma.Decimal("1"),
            unitCost: new Prisma.Decimal("8.00"),
            sourceType: "BILL",
            sourceId: "bill-new",
            effectiveAt: new Date("2025-02-20T00:00:00Z"),
            createdAt: new Date("2025-03-01T00:00:00Z"),
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await resolveInventoryCostLines({
      tx,
      orgId: "org-1",
      effectiveAt: new Date("2025-01-31T00:00:00Z"),
      useEffectiveDateCutoff: false,
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          qty: new Prisma.Decimal("1"),
          unitOfMeasureId: null,
        },
      ],
      itemsById: new Map([[baseItem.id, baseItem]]),
    });

    expect(result.costLines).toHaveLength(1);
    expect(toString2(result.costLines[0]?.unitCost ?? 0)).toBe("6.00");
  });

  it("retains sub-cent fractional quantities when averaging fallback movement cost", async () => {
    const tx = {
      unitOfMeasure: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m-1",
            itemId: "item-1",
            quantity: new Prisma.Decimal("0.0049"),
            unitCost: new Prisma.Decimal("100.00"),
            sourceType: "ADJUSTMENT",
            sourceId: "adj-1",
            effectiveAt: new Date("2025-01-01T00:00:00Z"),
            createdAt: new Date("2025-01-01T00:00:00Z"),
          },
          {
            id: "m-2",
            itemId: "item-1",
            quantity: new Prisma.Decimal("0.0049"),
            unitCost: new Prisma.Decimal("100.00"),
            sourceType: "ADJUSTMENT",
            sourceId: "adj-2",
            effectiveAt: new Date("2025-01-02T00:00:00Z"),
            createdAt: new Date("2025-01-02T00:00:00Z"),
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await resolveInventoryCostLines({
      tx,
      orgId: "org-1",
      effectiveAt: new Date("2025-02-01T00:00:00Z"),
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          qty: new Prisma.Decimal("0.0049"),
          unitOfMeasureId: null,
        },
      ],
      itemsById: new Map([[baseItem.id, baseItem]]),
    });

    expect(result.costLines).toHaveLength(1);
    expect(toString2(result.costLines[0]?.unitCost ?? 0)).toBe("100.00");
  });

  it("rounds inventory posting lines at currency precision without drift", () => {
    const costLines = [
      {
        lineId: "line-1",
        itemId: "item-1",
        expenseAccountId: "expense-1",
        inventoryAccountId: "inventory-1",
        baseQty: new Prisma.Decimal("1"),
        unitCost: new Prisma.Decimal("0.014"),
        totalCost: new Prisma.Decimal("0.014"),
      },
      {
        lineId: "line-2",
        itemId: "item-1",
        expenseAccountId: "expense-2",
        inventoryAccountId: "inventory-1",
        baseQty: new Prisma.Decimal("1"),
        unitCost: new Prisma.Decimal("0.014"),
        totalCost: new Prisma.Decimal("0.014"),
      },
      {
        lineId: "line-3",
        itemId: "item-1",
        expenseAccountId: "expense-3",
        inventoryAccountId: "inventory-1",
        baseQty: new Prisma.Decimal("1"),
        unitCost: new Prisma.Decimal("0.014"),
        totalCost: new Prisma.Decimal("0.014"),
      },
    ];

    const result = buildInventoryCostPostingLines({
      costLines,
      description: "Inventory cost rounding",
      direction: "ISSUE",
      startingLineNo: 1,
    });

    const debitTotal = result.lines.reduce((sum: Prisma.Decimal, line) => dec(sum).add(line.debit), dec(0));
    const creditTotal = result.lines.reduce((sum: Prisma.Decimal, line) => dec(sum).add(line.credit), dec(0));

    expect(toString2(debitTotal)).toBe("0.04");
    expect(toString2(creditTotal)).toBe("0.04");
    expect(toString2(result.totalDebit)).toBe("0.04");
    expect(toString2(result.totalCredit)).toBe("0.04");
  });
});
