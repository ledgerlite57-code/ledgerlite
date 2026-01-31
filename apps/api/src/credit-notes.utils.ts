import { dec, round2, type MoneyValue } from "./common/money";

export type PostingLineDraft = {
  lineNo: number;
  accountId: string;
  debit: MoneyValue;
  credit: MoneyValue;
  description?: string | null;
  customerId?: string | null;
  taxCodeId?: string | null;
};

const normalizeAmount = (value: MoneyValue) => round2(value);

export function buildCreditNotePostingLines(params: {
  creditNoteNumber?: string | null;
  customerId: string;
  total: MoneyValue;
  lines: Array<{
    itemId?: string | null;
    incomeAccountId?: string | null;
    lineSubTotal: MoneyValue;
    lineTax: MoneyValue;
    taxCodeId?: string | null;
  }>;
  itemsById: Map<string, { incomeAccountId: string }>;
  arAccountId: string;
  vatAccountId?: string;
}) {
  const revenueTotals = new Map<string, MoneyValue>();
  const taxTotals = new Map<string, MoneyValue>();

  for (const line of params.lines) {
    if (!line.itemId && !line.incomeAccountId) {
      throw new Error("Credit note lines must reference an item or income account to post");
    }
    const item = line.itemId ? params.itemsById.get(line.itemId) : undefined;
    if (line.itemId && !item) {
      throw new Error("Credit note item not found");
    }
    const incomeAccountId = line.incomeAccountId ?? item?.incomeAccountId;
    if (!incomeAccountId) {
      throw new Error("Income account is required for credit note posting");
    }
    const revenue = normalizeAmount(line.lineSubTotal);
    if (dec(revenue).greaterThan(0)) {
      const current = revenueTotals.get(incomeAccountId) ?? dec(0);
      revenueTotals.set(incomeAccountId, normalizeAmount(dec(current).add(revenue)));
    }

    const lineTax = normalizeAmount(line.lineTax);
    if (dec(lineTax).greaterThan(0)) {
      const taxKey = line.taxCodeId ?? "none";
      const current = taxTotals.get(taxKey) ?? dec(0);
      taxTotals.set(taxKey, normalizeAmount(dec(current).add(lineTax)));
    }
  }

  if (taxTotals.size > 0 && !params.vatAccountId) {
    throw new Error("VAT Payable account is not configured");
  }

  const lines: PostingLineDraft[] = [];
  let lineNo = 1;
  const description = params.creditNoteNumber ? `Credit note ${params.creditNoteNumber}` : "Credit note";

  const sortedRevenue = Array.from(revenueTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [accountId, amount] of sortedRevenue) {
    lines.push({
      lineNo: lineNo++,
      accountId,
      debit: normalizeAmount(amount),
      credit: dec(0),
      description,
      customerId: params.customerId,
    });
  }

  if (params.vatAccountId) {
    const sortedTax = Array.from(taxTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [taxCodeId, amount] of sortedTax) {
      lines.push({
        lineNo: lineNo++,
        accountId: params.vatAccountId,
        debit: normalizeAmount(amount),
        credit: dec(0),
        description: "VAT Payable",
        taxCodeId: taxCodeId === "none" ? null : taxCodeId,
      });
    }
  }

  lines.push({
    lineNo: lineNo++,
    accountId: params.arAccountId,
    debit: dec(0),
    credit: normalizeAmount(params.total),
    description,
    customerId: params.customerId,
  });

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
