import { add, dec, div, mul, round2, sub, toString2 } from "./money";

describe("money helpers", () => {
  it("rounds half up to 2 decimals", () => {
    expect(toString2(round2("10.005"))).toBe("10.01");
    expect(toString2(round2("10.004"))).toBe("10.00");
  });

  it("preserves precision for addition before rounding", () => {
    const sum = dec("0.1").add(dec("0.2"));
    expect(toString2(round2(sum))).toBe("0.30");
  });

  it("handles basic arithmetic with decimals", () => {
    expect(toString2(add("10.005", "0.005"))).toBe("10.01");
    expect(toString2(sub("5.1", "2.05"))).toBe("3.05");
    expect(toString2(mul("2.5", "4"))).toBe("10.00");
    expect(toString2(div("10", "4"))).toBe("2.50");
  });
});
