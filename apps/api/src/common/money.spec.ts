import { dec, round2, toString2 } from "./money";

describe("money helpers", () => {
  it("rounds half up to 2 decimals", () => {
    expect(toString2(round2("10.005"))).toBe("10.01");
    expect(toString2(round2("10.004"))).toBe("10.00");
  });

  it("preserves precision for addition before rounding", () => {
    const sum = dec("0.1").add(dec("0.2"));
    expect(toString2(round2(sum))).toBe("0.30");
  });
});
