import { buildInvoicePostingLines, calculateInvoiceLines } from "./invoices.utils";

describe("Invoice utilities", () => {
  it("calculates invoice totals with tax", () => {
    const itemsById = new Map([
      ["item-1", { id: "item-1", incomeAccountId: "income-1", defaultTaxCodeId: "tax-1", isActive: true }],
    ]);
    const taxCodesById = new Map([["tax-1", { id: "tax-1", rate: 5, type: "STANDARD" as const, isActive: true }]]);

    const result = calculateInvoiceLines({
      vatEnabled: true,
      itemsById,
      taxCodesById,
      lines: [
        {
          itemId: "item-1",
          description: "Consulting",
          qty: 2,
          unitPrice: 100,
          discountAmount: 0,
        },
      ],
    });

    expect(result.subTotal).toBe(200);
    expect(result.taxTotal).toBe(10);
    expect(result.total).toBe(210);
    expect(result.lines[0].lineTax).toBe(10);
  });

  it("builds balanced posting lines", () => {
    const itemsById = new Map([
      ["item-1", { incomeAccountId: "income-1" }],
      ["item-2", { incomeAccountId: "income-2" }],
    ]);

    const result = buildInvoicePostingLines({
      invoiceNumber: "INV-1",
      customerId: "cust-1",
      total: 315,
      arAccountId: "ar-1",
      vatAccountId: "vat-1",
      itemsById,
      lines: [
        { itemId: "item-1", lineSubTotal: 200, lineTax: 10, taxCodeId: "tax-1" },
        { itemId: "item-2", lineSubTotal: 100, lineTax: 5, taxCodeId: "tax-2" },
      ],
    });

    expect(result.totalDebit).toBe(315);
    expect(result.totalCredit).toBe(315);
    expect(result.lines[0]).toMatchObject({ accountId: "ar-1", debit: 315, credit: 0 });
  });
});
