import { buildPaymentPostingLines, calculatePaymentTotal } from "./payments-received.utils";
import { toString2 } from "./common/money";

describe("Payment received utilities", () => {
  it("calculates payment total from allocations", () => {
    const total = calculatePaymentTotal([
      { invoiceId: "inv-1", amount: 100 },
      { invoiceId: "inv-2", amount: 50.25 },
    ]);

    expect(toString2(total)).toBe("150.25");
  });

  it("builds balanced posting lines", () => {
    const result = buildPaymentPostingLines({
      paymentNumber: "PAY-1",
      customerId: "cust-1",
      amountTotal: 200,
      arAccountId: "ar-1",
      depositAccountId: "deposit-1",
    });

    expect(toString2(result.totalDebit)).toBe("200.00");
    expect(toString2(result.totalCredit)).toBe("200.00");
    expect(toString2(result.lines[0].debit)).toBe("200.00");
    expect(toString2(result.lines[0].credit)).toBe("0.00");
    expect(toString2(result.lines[1].debit)).toBe("0.00");
    expect(toString2(result.lines[1].credit)).toBe("200.00");
  });
});
