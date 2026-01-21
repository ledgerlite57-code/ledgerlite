import { add, dec, round2, type MoneyValue } from "./money";

export type TaxRoundingMode = "LINE" | "TOTAL";

export function roundMoney(value: MoneyValue) {
  return round2(value);
}

export function calculateTax(lines: MoneyValue[], ratePercent: MoneyValue, mode: TaxRoundingMode) {
  const rate = dec(ratePercent);
  const lineTaxes = lines.map((line) => round2(dec(line).mul(rate).div(100)));
  if (mode === "LINE") {
    const totalTax = lineTaxes.reduce((sum, tax) => round2(add(sum, tax)), dec(0));
    return { lineTaxes, totalTax };
  }

  const total = lines.reduce((sum, line) => round2(add(sum, line)), dec(0));
  const totalTax = round2(dec(total).mul(rate).div(100));
  return { lineTaxes, totalTax };
}
