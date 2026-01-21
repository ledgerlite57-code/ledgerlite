import { calculateTax } from "./tax";
import { toString2 } from "./money";

describe("calculateTax", () => {
  it("rounds per line vs total differently when needed", () => {
    const lines = [0.05, 0.05];
    const rate = 10;

    const lineResult = calculateTax(lines, rate, "LINE");
    const totalResult = calculateTax(lines, rate, "TOTAL");

    expect(toString2(lineResult.totalTax)).toBe("0.02");
    expect(toString2(totalResult.totalTax)).toBe("0.01");
  });

  it("matches totals when rounding does not diverge", () => {
    const lines = [100, 200];
    const rate = 5;

    const lineResult = calculateTax(lines, rate, "LINE");
    const totalResult = calculateTax(lines, rate, "TOTAL");

    expect(toString2(lineResult.totalTax)).toBe("15.00");
    expect(toString2(totalResult.totalTax)).toBe("15.00");
  });
});
