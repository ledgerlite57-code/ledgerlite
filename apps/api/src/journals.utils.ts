import { dec, round2, type MoneyValue } from "./common/money";

export type JournalLineAmount = { debit: MoneyValue; credit: MoneyValue };

export function calculateJournalTotals(lines: JournalLineAmount[]) {
  const totalDebit = round2(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = round2(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));
  return { totalDebit, totalCredit };
}

export function ensureValidJournalLines(lines: JournalLineAmount[]) {
  if (lines.length === 0) {
    throw new Error("Journal must include lines");
  }

  lines.forEach((line, index) => {
    const debit = round2(line.debit);
    const credit = round2(line.credit);
    const hasDebit = debit.greaterThan(0);
    const hasCredit = credit.greaterThan(0);

    if (hasDebit === hasCredit) {
      throw new Error(`Line ${index + 1} must include either a debit or credit amount`);
    }
  });
}
