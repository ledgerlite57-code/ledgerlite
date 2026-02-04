import { Prisma } from "@prisma/client";
import { resolveInventoryCostLines } from "./inventory-cost";
import { toString2 } from "./money";

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
            createdAt: new Date("2025-02-01T00:00:00Z"),
          },
          {
            id: "m-2",
            itemId: "item-1",
            quantity: new Prisma.Decimal("10"),
            unitCost: new Prisma.Decimal("8.00"),
            sourceType: "BILL",
            sourceId: "bill-new",
            createdAt: new Date("2025-03-01T00:00:00Z"),
          },
        ]),
      },
      bill: {
        findMany: jest.fn().mockResolvedValue([
          { id: "bill-old", billDate: new Date("2025-01-10T00:00:00Z") },
          { id: "bill-new", billDate: new Date("2025-02-20T00:00:00Z") },
        ]),
      },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
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

  it("falls back to movement created date when source-effective date is unavailable", async () => {
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
            createdAt: new Date("2025-01-01T00:00:00Z"),
          },
          {
            id: "m-new",
            itemId: "item-1",
            quantity: new Prisma.Decimal("1"),
            unitCost: new Prisma.Decimal("9.00"),
            sourceType: "ADJUSTMENT",
            sourceId: "adj-2",
            createdAt: new Date("2025-03-01T00:00:00Z"),
          },
        ]),
      },
      bill: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
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
});
