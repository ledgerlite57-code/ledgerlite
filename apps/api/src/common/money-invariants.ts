import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "@ledgerlite/shared";
import type { MoneyValue } from "./money";
import { round2, toString2 } from "./money";

export const assertNonNegativeDecimal = (value: MoneyValue, fieldName: string) => {
  const rounded = round2(value);
  if (rounded.isNegative()) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: `${fieldName} cannot be negative`,
      hint: "Use zero or a positive amount.",
      details: { value: toString2(rounded) },
    });
  }
};

export const assertMoneyEq = (debitTotal: MoneyValue, creditTotal: MoneyValue, context = "Totals") => {
  const debit = round2(debitTotal);
  const credit = round2(creditTotal);
  if (!debit.equals(credit)) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: `${context} must balance`,
      hint: "Check debit and credit totals.",
      details: {
        debit: toString2(debit),
        credit: toString2(credit),
      },
    });
  }
};
