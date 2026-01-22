import { dec, round2, type MoneyValue } from "./common/money";

export type VendorPaymentAllocationInput = {
  billId: string;
  amount: MoneyValue;
};

export type PostingLineDraft = {
  lineNo: number;
  accountId: string;
  debit: MoneyValue;
  credit: MoneyValue;
  description?: string | null;
  vendorId?: string | null;
};

export function calculateVendorPaymentTotal(allocations: VendorPaymentAllocationInput[]) {
  const total = allocations.reduce((sum, allocation) => dec(sum).add(allocation.amount), dec(0));
  return round2(total);
}

export function buildVendorPaymentPostingLines(params: {
  paymentNumber?: string | null;
  vendorId: string;
  amountTotal: MoneyValue;
  apAccountId: string;
  bankAccountId: string;
}) {
  const description = params.paymentNumber ? `Vendor payment ${params.paymentNumber}` : "Vendor payment";
  const amount = round2(params.amountTotal);

  const lines: PostingLineDraft[] = [
    {
      lineNo: 1,
      accountId: params.apAccountId,
      debit: amount,
      credit: dec(0),
      description,
      vendorId: params.vendorId,
    },
    {
      lineNo: 2,
      accountId: params.bankAccountId,
      debit: dec(0),
      credit: amount,
      description,
    },
  ];

  const totalDebit = round2(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = round2(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
