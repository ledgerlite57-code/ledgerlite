export type TaxRoundingMode = "LINE" | "TOTAL";

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTax(lines: number[], ratePercent: number, mode: TaxRoundingMode) {
  const lineTaxes = lines.map((line) => roundMoney((line * ratePercent) / 100));
  if (mode === "LINE") {
    const totalTax = roundMoney(lineTaxes.reduce((sum, tax) => sum + tax, 0));
    return { lineTaxes, totalTax };
  }

  const total = lines.reduce((sum, line) => sum + line, 0);
  const totalTax = roundMoney((total * ratePercent) / 100);
  return { lineTaxes, totalTax };
}
