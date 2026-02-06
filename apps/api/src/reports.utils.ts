import { add, dec } from "./common/money";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AgingBucketKey = "current" | "days1To30" | "days31To60" | "days61To90" | "days91Plus";

export const getAgingBucket = (agingDate: Date, asOfDate: Date): AgingBucketKey => {
  const start = new Date(Date.UTC(agingDate.getUTCFullYear(), agingDate.getUTCMonth(), agingDate.getUTCDate()));
  const end = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
  const diffDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);

  if (diffDays <= 0) {
    return "current";
  }
  if (diffDays <= 30) {
    return "days1To30";
  }
  if (diffDays <= 60) {
    return "days31To60";
  }
  if (diffDays <= 90) {
    return "days61To90";
  }
  return "days91Plus";
};

export type AgingTotals = Record<AgingBucketKey, ReturnType<typeof dec>>;

export const createAgingTotals = (): AgingTotals => ({
  current: dec(0),
  days1To30: dec(0),
  days31To60: dec(0),
  days61To90: dec(0),
  days91Plus: dec(0),
});

export const addToAgingTotals = (totals: AgingTotals, bucket: AgingBucketKey, amount: ReturnType<typeof dec>) => {
  totals[bucket] = add(totals[bucket], amount);
};
