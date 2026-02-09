import { dec, round2, eq, gt, type MoneyValue } from "./common/money";

export type InvoiceLineInput = {
  itemId?: string;
  lineType?: "ITEM" | "SHIPPING" | "ADJUSTMENT" | "ROUNDING";
  unitOfMeasureId?: string;
  incomeAccountId?: string;
  description: string;
  qty: MoneyValue;
  unitPrice: MoneyValue;
  discountAmount?: MoneyValue;
  taxCodeId?: string;
};

export type ResolvedItem = {
  id: string;
  incomeAccountId?: string | null;
  defaultTaxCodeId?: string | null;
  isActive?: boolean;
};

export type ResolvedTaxCode = {
  id: string;
  rate: MoneyValue;
  type: "STANDARD" | "ZERO" | "EXEMPT" | "OUT_OF_SCOPE";
  isActive?: boolean;
};

export type ResolvedUnit = {
  id: string;
  baseUnitId?: string | null;
  conversionRate?: MoneyValue;
  isActive?: boolean;
};

export type CalculatedInvoiceLine = {
  lineNo: number;
  itemId?: string | null;
  lineType: "ITEM" | "SHIPPING" | "ADJUSTMENT" | "ROUNDING";
  unitOfMeasureId?: string | null;
  incomeAccountId?: string | null;
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
  unitsById?: Map<string, ResolvedUnit>;
  vatEnabled: boolean;
  vatBehavior?: "EXCLUSIVE" | "INCLUSIVE";
}) {
  const calculated: CalculatedInvoiceLine[] = [];
  let subTotal = dec(0);
  let taxTotal = dec(0);
  const vatBehavior = params.vatBehavior ?? "EXCLUSIVE";

  params.lines.forEach((line, index) => {
    const item = line.itemId ? params.itemsById.get(line.itemId) : undefined;
    const lineType = line.lineType ?? "ITEM";
    const isRoundingLine = lineType === "ROUNDING";
    const fallbackTaxCodeId = item?.defaultTaxCodeId ?? undefined;
    const resolvedTaxCodeId = line.taxCodeId ?? fallbackTaxCodeId;

    if (resolvedTaxCodeId && !params.vatEnabled) {
      throw new Error("VAT is disabled for this organization");
    }

    const qty = dec(line.qty);
    const unitPrice = dec(line.unitPrice);
    const discountAmount = dec(line.discountAmount ?? 0);
    const gross = qty.mul(unitPrice);

    if (!isRoundingLine && discountAmount.greaterThan(gross)) {
      throw new Error("Discount exceeds line amount");
    }

    const lineAmount = normalizeAmount(gross.sub(discountAmount));
    if (!isRoundingLine && lineAmount.isNegative()) {
      throw new Error("Line subtotal cannot be negative");
    }
    if (isRoundingLine && dec(discountAmount).greaterThan(0)) {
      throw new Error("Rounding lines cannot include discounts");
    }
    if (isRoundingLine && resolvedTaxCodeId) {
      throw new Error("Rounding lines cannot include tax");
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
      itemId: line.itemId ?? null,
      lineType,
      unitOfMeasureId: line.unitOfMeasureId ?? null,
      incomeAccountId: line.incomeAccountId ?? null,
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
    incomeAccountId?: string | null;
    lineSubTotal: MoneyValue;
    lineTax: MoneyValue;
    taxCodeId?: string | null;
  }>;
  itemsById: Map<string, { incomeAccountId?: string | null }>;
  arAccountId: string;
  vatAccountId?: string;
}) {
  const revenueTotals = new Map<string, MoneyValue>();
  const taxTotals = new Map<string, MoneyValue>();

  for (const line of params.lines) {
    if (!line.itemId && !line.incomeAccountId) {
      throw new Error("Invoice lines must reference an item or income account to post");
    }
    const item = line.itemId ? params.itemsById.get(line.itemId) : undefined;
    if (line.itemId && !item) {
      throw new Error("Invoice item not found");
    }
    const incomeAccountId = line.incomeAccountId ?? item?.incomeAccountId;
    if (!incomeAccountId) {
      throw new Error("Income account is required for invoice posting");
    }
    const revenue = normalizeAmount(line.lineSubTotal);
    if (!eq(revenue, 0)) {
      const current = revenueTotals.get(incomeAccountId) ?? dec(0);
      revenueTotals.set(incomeAccountId, normalizeAmount(dec(current).add(revenue)));
    }

    const lineTax = normalizeAmount(line.lineTax);
    if (!eq(lineTax, 0)) {
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
    if (eq(amount, 0)) {
      continue;
    }
    const normalized = normalizeAmount(amount);
    if (gt(normalized, 0)) {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: dec(0),
        credit: normalized,
        description,
        customerId: params.customerId,
      });
    } else {
      lines.push({
        lineNo: lineNo++,
        accountId,
        debit: normalizeAmount(dec(0).sub(normalized)),
        credit: dec(0),
        description,
        customerId: params.customerId,
      });
    }
  }

  if (params.vatAccountId) {
    const sortedTax = Array.from(taxTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [taxCodeId, amount] of sortedTax) {
      if (eq(amount, 0)) {
        continue;
      }
      const normalized = normalizeAmount(amount);
      if (gt(normalized, 0)) {
        lines.push({
          lineNo: lineNo++,
          accountId: params.vatAccountId,
          debit: dec(0),
          credit: normalized,
          description: "VAT Payable",
          taxCodeId: taxCodeId === "none" ? null : taxCodeId,
        });
      } else {
        lines.push({
          lineNo: lineNo++,
          accountId: params.vatAccountId,
          debit: normalizeAmount(dec(0).sub(normalized)),
          credit: dec(0),
          description: "VAT Payable",
          taxCodeId: taxCodeId === "none" ? null : taxCodeId,
        });
      }
    }
  }

  const totalDebit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = normalizeAmount(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
