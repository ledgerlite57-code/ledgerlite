import { assertGlLinesValid } from "./gl-invariants";

describe("GL invariants", () => {
  it("fails when debit and credit are both set", () => {
    expect(() => assertGlLinesValid([{ debit: 10, credit: 5 }])).toThrow(
      "either a debit or credit",
    );
  });

  it("fails when negatives appear", () => {
    expect(() =>
      assertGlLinesValid([
        { debit: -1, credit: 0 },
        { debit: 0, credit: 1 },
      ]),
    ).toThrow("cannot be negative");
  });

  it("fails when totals are unbalanced", () => {
    expect(() =>
      assertGlLinesValid([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 90 },
      ]),
    ).toThrow("balance");
  });

  it("passes valid balanced lines", () => {
    expect(() =>
      assertGlLinesValid([
        { debit: 75, credit: 0 },
        { debit: 0, credit: 75 },
      ]),
    ).not.toThrow();
  });
});
