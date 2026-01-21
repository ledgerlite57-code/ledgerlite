import { buildPaymentPostingLines, calculatePaymentTotal } from "./payments-received.utils";

describe("Payment received utilities", () => {
  it("calculates payment total from allocations", () => {
    const total = calculatePaymentTotal([
      { invoiceId: "inv-1", amount: 100 },
      { invoiceId: "inv-2", amount: 50.25 },
    ]);

    expect(total).toBe(150.25);
  });

  it("builds balanced posting lines", () => {
    const result = buildPaymentPostingLines({
      paymentNumber: "PAY-1",
      customerId: "cust-1",
      amountTotal: 200,
      arAccountId: "ar-1",
      bankAccountId: "bank-1",
    });

    expect(result.totalDebit).toBe(200);
    expect(result.totalCredit).toBe(200);
    expect(result.lines[0]).toMatchObject({ accountId: "bank-1", debit: 200, credit: 0 });
    expect(result.lines[1]).toMatchObject({ accountId: "ar-1", debit: 0, credit: 200 });
  });
});
