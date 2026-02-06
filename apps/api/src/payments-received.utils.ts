import { dec, round2, type MoneyValue } from "./common/money";

export type PaymentAllocationInput = {
  invoiceId: string;
  amount: MoneyValue;
};

export type PostingLineDraft = {
  lineNo: number;
  accountId: string;
  debit: MoneyValue;
  credit: MoneyValue;
  description?: string | null;
  customerId?: string | null;
};

export function calculatePaymentTotal(allocations: PaymentAllocationInput[]) {
  const total = allocations.reduce((sum, allocation) => dec(sum).add(allocation.amount), dec(0));
  return round2(total);
}

export function buildPaymentPostingLines(params: {
  paymentNumber?: string | null;
  customerId: string;
  amountTotal: MoneyValue;
  arAccountId: string;
  depositAccountId: string;
}) {
  const description = params.paymentNumber ? `Payment ${params.paymentNumber}` : "Payment";
  const amount = round2(params.amountTotal);

  const lines: PostingLineDraft[] = [
    {
      lineNo: 1,
      accountId: params.depositAccountId,
      debit: amount,
      credit: dec(0),
      description,
    },
    {
      lineNo: 2,
      accountId: params.arAccountId,
      debit: dec(0),
      credit: amount,
      description,
      customerId: params.customerId,
    },
  ];

  const totalDebit = round2(lines.reduce((sum, line) => dec(sum).add(line.debit), dec(0)));
  const totalCredit = round2(lines.reduce((sum, line) => dec(sum).add(line.credit), dec(0)));

  return { lines, totalDebit, totalCredit };
}
