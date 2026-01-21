import { buildBillPostingLines, calculateBillLines } from "./bills.utils";

describe("Bill utilities", () => {
  it("calculates bill totals with tax", () => {
    const itemsById = new Map([
      ["item-1", { id: "item-1", expenseAccountId: "expense-1", defaultTaxCodeId: "tax-1", isActive: true }],
    ]);
    const taxCodesById = new Map(["tax-1"].map((id) => [id, { id, rate: 5, type: "STANDARD" as const, isActive: true }]));

    const result = calculateBillLines({
      vatEnabled: true,
      itemsById,
      taxCodesById,
      lines: [
        {
          expenseAccountId: "expense-1",
          itemId: "item-1",
          description: "Office Supplies",
          qty: 2,
          unitPrice: 100,
          discountAmount: 0,
        },
      ],
    });

    expect(result.subTotal).toBe(200);
    expect(result.taxTotal).toBe(10);
    expect(result.total).toBe(210);
  });

  it("builds balanced posting lines", () => {
    const result = buildBillPostingLines({
      billNumber: "BILL-1",
      vendorId: "vendor-1",
      total: 315,
      apAccountId: "ap-1",
      vatAccountId: "vat-1",
      lines: [
        { expenseAccountId: "expense-1", lineSubTotal: 200, lineTax: 10, taxCodeId: "tax-1" },
        { expenseAccountId: "expense-2", lineSubTotal: 100, lineTax: 5, taxCodeId: "tax-2" },
      ],
    });

    expect(result.totalDebit).toBe(315);
    expect(result.totalCredit).toBe(315);
    expect(result.lines[result.lines.length - 1]).toMatchObject({ accountId: "ap-1", credit: 315 });
  });
});
