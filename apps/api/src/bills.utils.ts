import { dec, round2, type MoneyValue } from "./common/money";

export type BillLineInput = {
  expenseAccountId: string;
  itemId?: string;
  unitOfMeasureId?: string;
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

export type ResolvedUnit = {
  id: string;
  baseUnitId?: string | null;
  conversionRate?: number | string;
  isActive?: boolean;
};

export type CalculatedBillLine = {
  lineNo: number;
  expenseAccountId: string;
  itemId?: string | null;
  unitOfMeasureId?: string | null;
  description: string;
  qty: MoneyValue;
  unitPrice: MoneyValue;
  discountAmount: MoneyValue;
  taxCodeId?: string | null;
  lineSubTotal: MoneyValue;
  lineTax: MoneyValue;
  lineTotal: MoneyValue;
};

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

export function calculateBillLines(params: {
  lines: BillLineInput[];
  itemsById: Map<string, ResolvedItem>;
  taxCodesById: Map<string, ResolvedTaxCode>;
  unitsById?: Map<string, ResolvedUnit>;
  vatEnabled: boolean;
  vatBehavior?: "EXCLUSIVE" | "INCLUSIVE";
}) {
  const calculated: CalculatedBillLine[] = [];
  let subTotal = dec(0);
  let taxTotal = dec(0);
  const vatBehavior = params.vatBehavior ?? "EXCLUSIVE";

  params.lines.forEach((line, index) => {
    const item = line.itemId ? params.itemsById.get(line.itemId) : undefined;
    const fallbackTaxCodeId = item?.defaultTaxCodeId ?? undefined;
    const resolvedTaxCodeId = line.taxCodeId ?? fallbackTaxCodeId;

    if (resolvedTaxCodeId && !params.vatEnabled) {
      throw new Error("VAT is disabled for this organization");
    }

    const qty = dec(line.qty);
    const unitPrice = dec(line.unitPrice);
    const discountAmount = dec(line.discountAmount ?? 0);
    const gross = qty.mul(unitPrice);

    if (discountAmount.greaterThan(gross)) {
      throw new Error("Discount exceeds line amount");
    }

    const lineAmount = normalizeAmount(gross.sub(discountAmount));
    if (lineAmount.isNegative()) {
      throw new Error("Line subtotal cannot be negative");
    }

    let lineSubTotal = lineAmount;
    let lineTax = dec(0);
    const taxCode = resolvedTaxCodeId ? params.taxCodesById.get(resolvedTaxCodeId) : undefined;
    if (taxCode) {
      if (taxCode.type === "STANDARD" && dec(taxCode.rate).greaterThan(0)) {
        if (vatBehavior === "INCLUSIVE") {
          const divisor = dec(1).add(dec(taxCode.rate).div(100));
          lineSubTotal = normalizeAmount(lineAmount.div(divisor));
          lineTax = normalizeAmount(lineAmount.sub(lineSubTotal));
        } else {
          lineTax = normalizeAmount(lineSubTotal.mul(dec(taxCode.rate)).div(100));
        }
      }
    } else if (resolvedTaxCodeId) {
      throw new Error("Tax code not found");
    }

    const lineTotal = normalizeAmount(vatBehavior === "INCLUSIVE" ? lineAmount : lineSubTotal.add(lineTax));

    subTotal = normalizeAmount(dec(subTotal).add(lineSubTotal));
    taxTotal = normalizeAmount(dec(taxTotal).add(lineTax));

    calculated.push({
      lineNo: index + 1,
      expenseAccountId: line.expenseAccountId,
      itemId: line.itemId ?? null,
      unitOfMeasureId: line.unitOfMeasureId ?? null,
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

  const total = normalizeAmount(dec(subTotal).add(taxTotal));

  return { lines: calculated, subTotal, taxTotal, total };
}

export function buildBillPostingLines(params: {
  billNumber?: string | null;
  vendorId: string;
  total: MoneyValue;
  lines: Array<{
    expenseAccountId: string;
    lineSubTotal: MoneyValue;
    lineTax: MoneyValue;
    taxCodeId?: string | null;
  }>;
  apAccountId: string;
  vatAccountId?: string;
}) {
  const expenseTotals = new Map<string, MoneyValue>();
  const taxTotals = new Map<string, MoneyValue>();

  for (const line of params.lines) {
    if (!line.expenseAccountId) {
      throw new Error("Bill lines must reference an expense account to post");
    }
    const expense = normalizeAmount(line.lineSubTotal);
    if (dec(expense).greaterThan(0)) {
      expenseTotals.set(
        line.expenseAccountId,
        normalizeAmount(dec(expenseTotals.get(line.expenseAccountId) ?? 0).add(expense)),
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
  const description = params.billNumber ? `Bill ${params.billNumber}` : "Bill";

  const sortedExpense = Array.from(expenseTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [accountId, amount] of sortedExpense) {
    lines.push({
      lineNo: lineNo++,
      accountId,
      debit: normalizeAmount(amount),
      credit: dec(0),
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
        credit: dec(0),
        description: "VAT Receivable",
        taxCodeId: taxCodeId === "none" ? null : taxCodeId,
      });
    }
  }

  lines.push({
    lineNo: lineNo++,
    accountId: params.apAccountId,
    debit: dec(0),
    credit: normalizeAmount(params.total),
    description,
    vendorId: params.vendorId,
  });

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
