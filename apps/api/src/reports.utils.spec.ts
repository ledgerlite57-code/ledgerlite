import { getAgingBucket } from "./reports.utils";

describe("Reports utilities", () => {
  it("places future or same-day items in current bucket", () => {
    const asOf = new Date("2025-01-15T00:00:00");
    expect(getAgingBucket(new Date("2025-01-15T00:00:00"), asOf)).toBe("current");
    expect(getAgingBucket(new Date("2025-01-20T00:00:00"), asOf)).toBe("current");
  });

  it("places aging items into correct buckets", () => {
    const asOf = new Date("2025-01-31T00:00:00");
    expect(getAgingBucket(new Date("2025-01-01T00:00:00"), asOf)).toBe("days1To30");
    expect(getAgingBucket(new Date("2024-12-15T00:00:00"), asOf)).toBe("days31To60");
    expect(getAgingBucket(new Date("2024-11-15T00:00:00"), asOf)).toBe("days61To90");
    expect(getAgingBucket(new Date("2024-10-01T00:00:00"), asOf)).toBe("days91Plus");
  });
});
