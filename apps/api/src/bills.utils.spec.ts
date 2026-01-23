import { buildBillPostingLines, calculateBillLines } from "./bills.utils";
import { toString2 } from "./common/money";

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

    expect(toString2(result.subTotal)).toBe("200.00");
    expect(toString2(result.taxTotal)).toBe("10.00");
    expect(toString2(result.total)).toBe("210.00");
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

    expect(toString2(result.totalDebit)).toBe("315.00");
    expect(toString2(result.totalCredit)).toBe("315.00");
    const lastLine = result.lines[result.lines.length - 1];
    expect(lastLine.accountId).toBe("ap-1");
    expect(toString2(lastLine.credit)).toBe("315.00");
  });

  it("applies unit conversion when a derived unit is selected", () => {
    const itemsById = new Map([["item-1", { id: "item-1", expenseAccountId: "expense-1" }]]);
    const taxCodesById = new Map();
    const unitsById = new Map([
      ["kg", { id: "kg", baseUnitId: null, conversionRate: 1 }],
      ["g", { id: "g", baseUnitId: "kg", conversionRate: 0.001 }],
    ]);

    const result = calculateBillLines({
      vatEnabled: false,
      itemsById,
      taxCodesById,
      unitsById,
      lines: [
        {
          expenseAccountId: "expense-1",
          itemId: "item-1",
          description: "Flour",
          qty: 500,
          unitPrice: 2,
          unitOfMeasureId: "g",
          discountAmount: 0,
        },
      ],
    });

    expect(toString2(result.subTotal)).toBe("1.00");
    expect(toString2(result.total)).toBe("1.00");
  });

  it("throws when posting has tax but VAT account is missing", () => {
    expect(() =>
      buildBillPostingLines({
        billNumber: "BILL-2",
        vendorId: "vendor-1",
        total: "110.00",
        apAccountId: "ap-1",
        lines: [{ expenseAccountId: "expense-1", lineSubTotal: "100.00", lineTax: "10.00", taxCodeId: "tax-1" }],
      }),
    ).toThrow("VAT Receivable account is not configured");
  });
});
