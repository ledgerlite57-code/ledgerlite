import { roundMoney } from "./common/tax";

export type BillLineInput = {
  expenseAccountId: string;
  itemId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountAmount?: number;
  taxCodeId?: string;
};

export type ResolvedItem = {
  id: string;
  expenseAccountId: string;
  defaultTaxCodeId?: string | null;
  isActive?: boolean;
};

export type ResolvedTaxCode = {
  id: string;
  rate: number;
  type: "STANDARD" | "ZERO" | "EXEMPT" | "OUT_OF_SCOPE";
  isActive?: boolean;
};

export type CalculatedBillLine = {
  lineNo: number;
  expenseAccountId: string;
  itemId?: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  discountAmount: number;
  taxCodeId?: string | null;
  lineSubTotal: number;
  lineTax: number;
  lineTotal: number;
};

export type PostingLineDraft = {
  lineNo: number;
  accountId: string;
  debit: number;
  credit: number;
  description?: string | null;
  vendorId?: string | null;
  taxCodeId?: string | null;
};

const normalizeAmount = (value: number) => roundMoney(value);

export function calculateBillLines(params: {
  lines: BillLineInput[];
  itemsById: Map<string, ResolvedItem>;
  taxCodesById: Map<string, ResolvedTaxCode>;
  vatEnabled: boolean;
}) {
  const calculated: CalculatedBillLine[] = [];
  let subTotal = 0;
  let taxTotal = 0;

  params.lines.forEach((line, index) => {
    const item = line.itemId ? params.itemsById.get(line.itemId) : undefined;
    const fallbackTaxCodeId = item?.defaultTaxCodeId ?? undefined;
    const resolvedTaxCodeId = line.taxCodeId ?? fallbackTaxCodeId;

    if (resolvedTaxCodeId && !params.vatEnabled) {
      throw new Error("VAT is disabled for this organization");
    }

    const qty = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    const discountAmount = Number(line.discountAmount ?? 0);
    const gross = qty * unitPrice;

    if (discountAmount > gross) {
      throw new Error("Discount exceeds line amount");
    }

    const lineSubTotal = normalizeAmount(gross - discountAmount);
    if (lineSubTotal < 0) {
      throw new Error("Line subtotal cannot be negative");
    }

    let lineTax = 0;
    const taxCode = resolvedTaxCodeId ? params.taxCodesById.get(resolvedTaxCodeId) : undefined;
    if (taxCode) {
      if (taxCode.type === "STANDARD" && taxCode.rate > 0) {
        lineTax = normalizeAmount((lineSubTotal * taxCode.rate) / 100);
      }
    } else if (resolvedTaxCodeId) {
      throw new Error("Tax code not found");
    }

    const lineTotal = normalizeAmount(lineSubTotal + lineTax);

    subTotal = normalizeAmount(subTotal + lineSubTotal);
    taxTotal = normalizeAmount(taxTotal + lineTax);

    calculated.push({
      lineNo: index + 1,
      expenseAccountId: line.expenseAccountId,
      itemId: line.itemId ?? null,
      description: line.description,
      qty,
      unitPrice,
      discountAmount,
      taxCodeId: resolvedTaxCodeId ?? null,
      lineSubTotal,
      lineTax,
      lineTotal,
    });
  });

  const total = normalizeAmount(subTotal + taxTotal);

  return { lines: calculated, subTotal, taxTotal, total };
}

export function buildBillPostingLines(params: {
  billNumber?: string | null;
  vendorId: string;
  total: number;
  lines: Array<{
    expenseAccountId: string;
    lineSubTotal: number;
    lineTax: number;
    taxCodeId?: string | null;
  }>;
  apAccountId: string;
  vatAccountId?: string;
}) {
  const expenseTotals = new Map<string, number>();
  const taxTotals = new Map<string, number>();

  for (const line of params.lines) {
    if (!line.expenseAccountId) {
      throw new Error("Bill lines must reference an expense account to post");
    }
    const expense = normalizeAmount(line.lineSubTotal);
    if (expense > 0) {
      expenseTotals.set(
        line.expenseAccountId,
        normalizeAmount((expenseTotals.get(line.expenseAccountId) ?? 0) + expense),
      );
    }

    const lineTax = normalizeAmount(line.lineTax);
    if (lineTax > 0) {
      const taxKey = line.taxCodeId ?? "none";
      taxTotals.set(taxKey, normalizeAmount((taxTotals.get(taxKey) ?? 0) + lineTax));
    }
  }

  if (taxTotals.size > 0 && !params.vatAccountId) {
    throw new Error("VAT Receivable account is not configured");
  }

  const lines: PostingLineDraft[] = [];
  let lineNo = 1;
  const description = params.billNumber ? `Bill ${params.billNumber}` : "Bill";

  const sortedExpense = Array.from(expenseTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [accountId, amount] of sortedExpense) {
    lines.push({
      lineNo: lineNo++,
      accountId,
      debit: normalizeAmount(amount),
      credit: 0,
      description,
    });
  }

  if (params.vatAccountId) {
    const sortedTax = Array.from(taxTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [taxCodeId, amount] of sortedTax) {
      lines.push({
        lineNo: lineNo++,
        accountId: params.vatAccountId,
        debit: normalizeAmount(amount),
        credit: 0,
        description: "VAT Receivable",
        taxCodeId: taxCodeId === "none" ? null : taxCodeId,
      });
    }
  }

  lines.push({
    lineNo: lineNo++,
    accountId: params.apAccountId,
    debit: 0,
    credit: normalizeAmount(params.total),
    description,
    vendorId: params.vendorId,
  });

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => sum + line.credit, 0));

  return { lines, totalDebit, totalCredit };
}
