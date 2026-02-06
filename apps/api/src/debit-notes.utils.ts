import { dec, round2, type MoneyValue } from "./common/money";

export type PostingLineDraft = {
  lineNo: number;
  accountId: string;
  debit: MoneyValue;
  credit: MoneyValue;
  description?: string | null;
  vendorId?: string | null;
  taxCodeId?: string | null;
};

const normalizeAmount = (value: MoneyValue) => round2(value);

export function buildDebitNotePostingLines(params: {
  debitNoteNumber?: string | null;
  vendorId: string;
  total: MoneyValue;
  lines: Array<{
    itemId?: string | null;
    expenseAccountId?: string | null;
    lineSubTotal: MoneyValue;
    lineTax: MoneyValue;
    taxCodeId?: string | null;
  }>;
  itemsById: Map<string, { expenseAccountId?: string | null }>;
  apAccountId: string;
  vatAccountId?: string;
}) {
  const expenseTotals = new Map<string, MoneyValue>();
  const taxTotals = new Map<string, MoneyValue>();

  for (const line of params.lines) {
    const item = line.itemId ? params.itemsById.get(line.itemId) : undefined;
    if (line.itemId && !item) {
      throw new Error("Debit note item not found");
    }
    const expenseAccountId = line.expenseAccountId ?? item?.expenseAccountId;
    if (!expenseAccountId) {
      throw new Error("Expense account is required for debit note posting");
    }
    const expense = normalizeAmount(line.lineSubTotal);
    if (dec(expense).greaterThan(0)) {
      expenseTotals.set(
        expenseAccountId,
        normalizeAmount(dec(expenseTotals.get(expenseAccountId) ?? 0).add(expense)),
      );
    }

    const lineTax = normalizeAmount(line.lineTax);
    if (dec(lineTax).greaterThan(0)) {
      const taxKey = line.taxCodeId ?? "none";
      taxTotals.set(taxKey, normalizeAmount(dec(taxTotals.get(taxKey) ?? 0).add(lineTax)));
    }
  }

  if (taxTotals.size > 0 && !params.vatAccountId) {
    throw new Error("VAT Receivable account is not configured");
  }

  const lines: PostingLineDraft[] = [];
  let lineNo = 1;
  const description = params.debitNoteNumber ? `Debit note ${params.debitNoteNumber}` : "Debit note";

  const sortedExpense = Array.from(expenseTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [accountId, amount] of sortedExpense) {
    lines.push({
      lineNo: lineNo++,
      accountId,
      debit: dec(0),
      credit: normalizeAmount(amount),
      description,
    });
  }

  if (params.vatAccountId) {
    const sortedTax = Array.from(taxTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [taxCodeId, amount] of sortedTax) {
      lines.push({
        lineNo: lineNo++,
        accountId: params.vatAccountId,
        debit: dec(0),
        credit: normalizeAmount(amount),
        description: "VAT Receivable",
        taxCodeId: taxCodeId === "none" ? null : taxCodeId,
      });
    }
  }

  lines.push({
    lineNo: lineNo++,
    accountId: params.apAccountId,
    debit: normalizeAmount(params.total),
    credit: dec(0),
    description,
    vendorId: params.vendorId,
  });

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
