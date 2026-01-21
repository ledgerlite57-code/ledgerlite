import { dec, round2, type MoneyValue } from "./common/money";

export type InvoiceLineInput = {
  itemId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountAmount?: number;
  taxCodeId?: string;
};

export type ResolvedItem = {
  id: string;
  incomeAccountId: string;
  defaultTaxCodeId?: string | null;
  isActive?: boolean;
};

export type ResolvedTaxCode = {
  id: string;
  rate: number;
  type: "STANDARD" | "ZERO" | "EXEMPT" | "OUT_OF_SCOPE";
  isActive?: boolean;
};

export type CalculatedInvoiceLine = {
  lineNo: number;
  itemId?: string | null;
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
  customerId?: string | null;
  taxCodeId?: string | null;
};

const normalizeAmount = (value: MoneyValue) => round2(value);

export function calculateInvoiceLines(params: {
  lines: InvoiceLineInput[];
  itemsById: Map<string, ResolvedItem>;
  taxCodesById: Map<string, ResolvedTaxCode>;
  vatEnabled: boolean;
}) {
  const calculated: CalculatedInvoiceLine[] = [];
  let subTotal = dec(0);
  let taxTotal = dec(0);

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

    const lineSubTotal = normalizeAmount(gross.sub(discountAmount));
    if (lineSubTotal.isNegative()) {
      throw new Error("Line subtotal cannot be negative");
    }

    let lineTax = dec(0);
    const taxCode = resolvedTaxCodeId ? params.taxCodesById.get(resolvedTaxCodeId) : undefined;
    if (taxCode) {
      if (taxCode.type === "STANDARD" && dec(taxCode.rate).greaterThan(0)) {
        lineTax = normalizeAmount(lineSubTotal.mul(dec(taxCode.rate)).div(100));
      }
    } else if (resolvedTaxCodeId) {
      throw new Error("Tax code not found");
    }

    const lineTotal = normalizeAmount(lineSubTotal.add(lineTax));

    subTotal = normalizeAmount(dec(subTotal).add(lineSubTotal));
    taxTotal = normalizeAmount(dec(taxTotal).add(lineTax));

    calculated.push({
      lineNo: index + 1,
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

  const total = normalizeAmount(dec(subTotal).add(taxTotal));

  return { lines: calculated, subTotal, taxTotal, total };
}

export function buildInvoicePostingLines(params: {
  invoiceNumber?: string | null;
  customerId: string;
  total: MoneyValue;
  lines: Array<{
    itemId?: string | null;
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
    if (!line.itemId) {
      throw new Error("Invoice lines must reference an item to post");
    }
    const item = params.itemsById.get(line.itemId);
    if (!item) {
      throw new Error("Invoice item not found");
    }
    const revenue = normalizeAmount(line.lineSubTotal);
    if (dec(revenue).greaterThan(0)) {
      const current = revenueTotals.get(item.incomeAccountId) ?? dec(0);
      revenueTotals.set(item.incomeAccountId, normalizeAmount(dec(current).add(revenue)));
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
  const description = params.invoiceNumber ? `Invoice ${params.invoiceNumber}` : "Invoice";

  lines.push({
    lineNo: lineNo++,
    accountId: params.arAccountId,
    debit: normalizeAmount(params.total),
    credit: dec(0),
    description,
    customerId: params.customerId,
  });

  const sortedRevenue = Array.from(revenueTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [accountId, amount] of sortedRevenue) {
    lines.push({
      lineNo: lineNo++,
      accountId,
      debit: dec(0),
      credit: normalizeAmount(amount),
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
        debit: dec(0),
        credit: normalizeAmount(amount),
        description: "VAT Payable",
        taxCodeId: taxCodeId === "none" ? null : taxCodeId,
      });
    }
  }

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
