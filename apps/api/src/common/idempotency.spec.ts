import { hashRequestBody } from "./idempotency";

describe("hashRequestBody", () => {
  it("returns the same hash for the same payload", () => {
    const payload = { amount: 100, currency: "AED", lines: [{ id: "1", qty: 2 }] };
    expect(hashRequestBody(payload)).toBe(hashRequestBody(payload));
  });

  it("treats null and undefined as empty payloads", () => {
    expect(hashRequestBody(undefined)).toBe(hashRequestBody(null));
    expect(hashRequestBody(undefined)).toBe(hashRequestBody({}));
  });

  it("changes when payload changes", () => {
    const first = hashRequestBody({ amount: 100, currency: "AED" });
    const second = hashRequestBody({ amount: 101, currency: "AED" });
    expect(first).not.toBe(second);
  });
});
