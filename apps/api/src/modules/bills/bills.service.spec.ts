import { toString2 } from "../../common/money";
import { deriveBillMovementUnitCost, roundInventoryQty } from "./bills.service";

describe("bills inventory movement helpers", () => {
  it("rounds base quantity to inventory precision (4 dp)", () => {
    expect(roundInventoryQty("0.00494").toFixed(4)).toBe("0.0049");
    expect(roundInventoryQty("0.00495").toFixed(4)).toBe("0.0050");
  });

  it("derives unit cost from rounded base quantity", () => {
    const unitCost = deriveBillMovementUnitCost({
      lineSubTotal: "1.00",
      qtyBase: "0.333333",
    });

    expect(toString2(unitCost ?? 0)).toBe("3.00");
  });

  it("returns undefined when rounded base quantity is zero", () => {
    const unitCost = deriveBillMovementUnitCost({
      lineSubTotal: "10.00",
      qtyBase: "0.00004",
    });

    expect(unitCost).toBeUndefined();
  });
});
