import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "@ledgerlite/shared";
import { ensureBaseCurrencyOnly } from "./currency-policy";

describe("currency policy", () => {
  it("blocks when document currency differs from base", () => {
    try {
      ensureBaseCurrencyOnly("AED", "USD");
      throw new Error("Expected currency guard to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as { code?: string };
      expect(response.code).toBe(ErrorCodes.MULTICURRENCY_NOT_SUPPORTED);
    }
  });

  it("allows when currency matches", () => {
    expect(() => ensureBaseCurrencyOnly("AED", "AED")).not.toThrow();
  });
});
