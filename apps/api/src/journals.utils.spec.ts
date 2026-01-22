import { calculateJournalTotals, ensureValidJournalLines } from "./journals.utils";
import { toString2 } from "./common/money";

describe("Journal utilities", () => {
  it("calculates totals for debit and credit lines", () => {
    const totals = calculateJournalTotals([
      { debit: 120, credit: 0 },
      { debit: 0, credit: 120 },
      { debit: 10.5, credit: 0 },
      { debit: 0, credit: 10.5 },
    ]);

    expect(toString2(totals.totalDebit)).toBe("130.50");
    expect(toString2(totals.totalCredit)).toBe("130.50");
  });

  it("rejects lines with both debit and credit", () => {
    expect(() => ensureValidJournalLines([{ debit: 10, credit: 5 }])).toThrow(
      "Line 1 must include either a debit or credit amount",
    );
  });

  it("rejects lines with no amounts", () => {
    expect(() => ensureValidJournalLines([{ debit: 0, credit: 0 }])).toThrow(
      "Line 1 must include either a debit or credit amount",
    );
  });
});
