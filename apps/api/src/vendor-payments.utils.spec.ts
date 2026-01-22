import { buildVendorPaymentPostingLines, calculateVendorPaymentTotal } from "./vendor-payments.utils";
import { toString2 } from "./common/money";

describe("Vendor payment utilities", () => {
  it("calculates payment total from allocations", () => {
    const total = calculateVendorPaymentTotal([
      { billId: "bill-1", amount: 100 },
      { billId: "bill-2", amount: 50.25 },
    ]);

    expect(toString2(total)).toBe("150.25");
  });

  it("builds balanced posting lines", () => {
    const result = buildVendorPaymentPostingLines({
      paymentNumber: "VP-1",
      vendorId: "vendor-1",
      amountTotal: 200,
      apAccountId: "ap-1",
      bankAccountId: "bank-1",
    });

    expect(toString2(result.totalDebit)).toBe("200.00");
    expect(toString2(result.totalCredit)).toBe("200.00");
    expect(toString2(result.lines[0].debit)).toBe("200.00");
    expect(toString2(result.lines[0].credit)).toBe("0.00");
    expect(toString2(result.lines[1].debit)).toBe("0.00");
    expect(toString2(result.lines[1].credit)).toBe("200.00");
  });
});
