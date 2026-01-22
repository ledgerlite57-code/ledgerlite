import { dedupeImportTransactions } from "./bank-transactions.utils";

describe("Bank transaction import utilities", () => {
  it("dedupes transactions with external references", () => {
    const result = dedupeImportTransactions([
      { externalRef: "REF-1" },
      { externalRef: "REF-1" },
      { externalRef: "REF-2" },
      { externalRef: "  REF-2  " },
      { externalRef: null },
      { externalRef: undefined },
    ]);

    expect(result.unique).toHaveLength(4);
    expect(result.skipped).toBe(2);
  });
});
