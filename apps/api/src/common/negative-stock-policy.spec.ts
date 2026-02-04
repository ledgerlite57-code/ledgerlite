import { BadRequestException } from "@nestjs/common";
import {
  assertNegativeStockPolicy,
  detectNegativeStockIssues,
  normalizeNegativeStockPolicy,
  serializeNegativeStockIssues,
} from "./negative-stock-policy";

describe("negative stock policy helpers", () => {
  it("normalizes policy values and defaults to ALLOW", () => {
    expect(normalizeNegativeStockPolicy("block")).toBe("BLOCK");
    expect(normalizeNegativeStockPolicy("warn")).toBe("WARN");
    expect(normalizeNegativeStockPolicy("allow")).toBe("ALLOW");
    expect(normalizeNegativeStockPolicy(undefined)).toBe("ALLOW");
    expect(normalizeNegativeStockPolicy("unexpected")).toBe("ALLOW");
  });

  it("detects only entries that would go below zero", () => {
    const issues = detectNegativeStockIssues([
      { itemId: "item-ok", onHandQty: "10", issueQty: "2" },
      { itemId: "item-bad", onHandQty: "1", issueQty: "2" },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.itemId).toBe("item-bad");
    expect(issues[0]?.projectedQty.toString()).toBe("-1");
  });

  it("throws only when policy is BLOCK and issues exist", () => {
    const issues = detectNegativeStockIssues([{ itemId: "item-bad", onHandQty: "0", issueQty: "1" }]);

    expect(() => assertNegativeStockPolicy("ALLOW", issues)).not.toThrow();
    expect(() => assertNegativeStockPolicy("WARN", issues)).not.toThrow();
    expect(() => assertNegativeStockPolicy("BLOCK", issues)).toThrow(BadRequestException);
  });

  it("serializes issue quantities as strings", () => {
    const issues = detectNegativeStockIssues([{ itemId: "item-bad", onHandQty: "0.5", issueQty: "1" }]);
    const serialized = serializeNegativeStockIssues(issues);
    expect(serialized).toEqual([
      {
        itemId: "item-bad",
        onHandQty: "0.5",
        issueQty: "1",
        projectedQty: "-0.5",
      },
    ]);
  });
});
