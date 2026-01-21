import { roundMoney } from "./common/tax";

export type PaymentAllocationInput = {
  invoiceId: string;
  amount: number;
};

export type PostingLineDraft = {
  lineNo: number;
  accountId: string;
  debit: number;
  credit: number;
  description?: string | null;
  customerId?: string | null;
};

export function calculatePaymentTotal(allocations: PaymentAllocationInput[]) {
  return allocations.reduce((sum, allocation) => roundMoney(sum + Number(allocation.amount)), 0);
}

export function buildPaymentPostingLines(params: {
  paymentNumber?: string | null;
  customerId: string;
  amountTotal: number;
  arAccountId: string;
  bankAccountId: string;
}) {
  const description = params.paymentNumber ? `Payment ${params.paymentNumber}` : "Payment";
  const amount = roundMoney(params.amountTotal);

  const lines: PostingLineDraft[] = [
    {
      lineNo: 1,
      accountId: params.bankAccountId,
      debit: amount,
      credit: 0,
      description,
    },
    {
      lineNo: 2,
      accountId: params.arAccountId,
      debit: 0,
      credit: amount,
      description,
      customerId: params.customerId,
    },
  ];

  const totalDebit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0));

  return { lines, totalDebit, totalCredit };
}
