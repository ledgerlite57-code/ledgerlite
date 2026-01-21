import { roundMoney } from "./common/tax";

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
  customerId?: string | null;
  taxCodeId?: string | null;
};

const normalizeAmount = (value: number) => roundMoney(value);

export function calculateInvoiceLines(params: {
  lines: InvoiceLineInput[];
  itemsById: Map<string, ResolvedItem>;
  taxCodesById: Map<string, ResolvedTaxCode>;
  vatEnabled: boolean;
}) {
  const calculated: CalculatedInvoiceLine[] = [];
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

export function buildInvoicePostingLines(params: {
  invoiceNumber?: string | null;
  customerId: string;
  total: number;
  lines: Array<{
    itemId?: string | null;
    lineSubTotal: number;
    lineTax: number;
    taxCodeId?: string | null;
  }>;
  itemsById: Map<string, { incomeAccountId: string }>;
  arAccountId: string;
  vatAccountId?: string;
}) {
  const revenueTotals = new Map<string, number>();
  const taxTotals = new Map<string, number>();

  for (const line of params.lines) {
    if (!line.itemId) {
      throw new Error("Invoice lines must reference an item to post");
    }
    const item = params.itemsById.get(line.itemId);
    if (!item) {
      throw new Error("Invoice item not found");
    }
    const revenue = normalizeAmount(line.lineSubTotal);
    if (revenue > 0) {
      revenueTotals.set(item.incomeAccountId, normalizeAmount((revenueTotals.get(item.incomeAccountId) ?? 0) + revenue));
    }

    const lineTax = normalizeAmount(line.lineTax);
    if (lineTax > 0) {
      const taxKey = line.taxCodeId ?? "none";
      taxTotals.set(taxKey, normalizeAmount((taxTotals.get(taxKey) ?? 0) + lineTax));
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
    credit: 0,
    description,
    customerId: params.customerId,
  });

  const sortedRevenue = Array.from(revenueTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [accountId, amount] of sortedRevenue) {
    lines.push({
      lineNo: lineNo++,
      accountId,
      debit: 0,
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
        debit: 0,
        credit: normalizeAmount(amount),
        description: "VAT Payable",
        taxCodeId: taxCodeId === "none" ? null : taxCodeId,
      });
    }
  }

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => sum + line.credit, 0));

  return { lines, totalDebit, totalCredit };
}
