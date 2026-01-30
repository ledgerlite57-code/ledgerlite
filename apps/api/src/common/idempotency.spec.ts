import { buildIdempotencyKey, hashRequestBody } from "./idempotency";

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

  it("is stable regardless of object key order", () => {
    const first = hashRequestBody({ amount: 100, currency: "AED", meta: { b: 2, a: 1 } });
    const second = hashRequestBody({ meta: { a: 1, b: 2 }, currency: "AED", amount: 100 });
    expect(first).toBe(second);
  });
});

describe("buildIdempotencyKey", () => {
  it("returns undefined for missing key", () => {
    expect(buildIdempotencyKey(undefined, { scope: "test" })).toBeUndefined();
  });

  it("namespaces key with scope and user", () => {
    expect(
      buildIdempotencyKey("idem-1", { scope: "invoices.create", actorUserId: "user-1" }),
    ).toBe("idem-1:invoices.create:user-1");
  });
});
