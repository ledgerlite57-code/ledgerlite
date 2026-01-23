import { buildInvoicePostingLines, calculateInvoiceLines } from "./invoices.utils";
import { assertGlLinesValid } from "./common/gl-invariants";
import { toString2 } from "./common/money";

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

    expect(toString2(result.subTotal)).toBe("200.00");
    expect(toString2(result.taxTotal)).toBe("10.00");
    expect(toString2(result.total)).toBe("210.00");
    expect(toString2(result.lines[0].lineTax)).toBe("10.00");
  });

  it("builds balanced posting lines", () => {
    const itemsById = new Map([
      ["item-1", { incomeAccountId: "income-1" }],
      ["item-2", { incomeAccountId: "income-2" }],
    ]);

    const result = buildInvoicePostingLines({
      invoiceNumber: "INV-1",
      customerId: "cust-1",
      total: "315.00",
      arAccountId: "ar-1",
      vatAccountId: "vat-1",
      itemsById,
      lines: [
        { itemId: "item-1", lineSubTotal: "200.00", lineTax: "10.00", taxCodeId: "tax-1" },
        { itemId: "item-2", lineSubTotal: "100.00", lineTax: "5.00", taxCodeId: "tax-2" },
      ],
    });

    expect(toString2(result.totalDebit)).toBe("315.00");
    expect(toString2(result.totalCredit)).toBe("315.00");
    expect(result.lines[0].accountId).toBe("ar-1");
    expect(toString2(result.lines[0].debit)).toBe("315.00");
    expect(toString2(result.lines[0].credit)).toBe("0.00");
    expect(() => assertGlLinesValid(result.lines)).not.toThrow();
  });

  it("keeps pricing per selected unit of measure", () => {
    const itemsById = new Map([["item-1", { id: "item-1", incomeAccountId: "income-1" }]]);
    const taxCodesById = new Map();
    const unitsById = new Map([
      ["kg", { id: "kg", baseUnitId: null, conversionRate: 1 }],
      ["g", { id: "g", baseUnitId: "kg", conversionRate: 0.001 }],
    ]);

    const result = calculateInvoiceLines({
      vatEnabled: false,
      itemsById,
      taxCodesById,
      unitsById,
      lines: [
        {
          itemId: "item-1",
          description: "Flour",
          qty: 500,
          unitPrice: 2,
          unitOfMeasureId: "g",
          discountAmount: 0,
        },
      ],
    });

    expect(toString2(result.subTotal)).toBe("1000.00");
    expect(toString2(result.total)).toBe("1000.00");
  });

  it("throws when VAT is disabled but a tax code is provided", () => {
    const itemsById = new Map([["item-1", { id: "item-1", incomeAccountId: "income-1", defaultTaxCodeId: "tax-1" }]]);
    const taxCodesById = new Map([["tax-1", { id: "tax-1", rate: 5, type: "STANDARD" as const }]]);

    expect(() =>
      calculateInvoiceLines({
        vatEnabled: false,
        itemsById,
        taxCodesById,
        lines: [
          {
            itemId: "item-1",
            description: "Consulting",
            qty: 1,
            unitPrice: 100,
            discountAmount: 0,
            taxCodeId: "tax-1",
          },
        ],
      }),
    ).toThrow("VAT is disabled");
  });

  it("throws when posting has tax but VAT account is missing", () => {
    const itemsById = new Map([["item-1", { incomeAccountId: "income-1" }]]);

    expect(() =>
      buildInvoicePostingLines({
        invoiceNumber: "INV-2",
        customerId: "cust-1",
        total: "110.00",
        arAccountId: "ar-1",
        itemsById,
        lines: [{ itemId: "item-1", lineSubTotal: "100.00", lineTax: "10.00", taxCodeId: "tax-1" }],
      }),
    ).toThrow("VAT Payable account is not configured");
  });

  it("throws when a discount exceeds the line amount", () => {
    const itemsById = new Map([["item-1", { id: "item-1", incomeAccountId: "income-1" }]]);
    const taxCodesById = new Map();

    expect(() =>
      calculateInvoiceLines({
        vatEnabled: false,
        itemsById,
        taxCodesById,
        lines: [
          {
            itemId: "item-1",
            description: "Consulting",
            qty: 1,
            unitPrice: 100,
            discountAmount: 150,
          },
        ],
      }),
    ).toThrow("Discount exceeds line amount");
  });
});
