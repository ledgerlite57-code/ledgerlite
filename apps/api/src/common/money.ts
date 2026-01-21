import { Prisma } from "@prisma/client";

export type MoneyValue = Prisma.Decimal.Value;

export const zero = () => new Prisma.Decimal(0);

export function dec(value: MoneyValue = 0) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function add(a: MoneyValue, b: MoneyValue) {
  return dec(a).add(dec(b));
}

export function sub(a: MoneyValue, b: MoneyValue) {
  return dec(a).sub(dec(b));
}

export function mul(a: MoneyValue, b: MoneyValue) {
  return dec(a).mul(dec(b));
}

export function div(a: MoneyValue, b: MoneyValue) {
  return dec(a).div(dec(b));
}

export function round2(value: MoneyValue) {
  return dec(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function eq(a: MoneyValue, b: MoneyValue) {
  return dec(a).equals(dec(b));
}

export function gt(a: MoneyValue, b: MoneyValue) {
  return dec(a).greaterThan(dec(b));
}

export function gte(a: MoneyValue, b: MoneyValue) {
  return dec(a).greaterThanOrEqualTo(dec(b));
}

export function lt(a: MoneyValue, b: MoneyValue) {
  return dec(a).lessThan(dec(b));
}

export function lte(a: MoneyValue, b: MoneyValue) {
  return dec(a).lessThanOrEqualTo(dec(b));
}

export function toString2(value: MoneyValue) {
  return round2(value).toFixed(2);
}
