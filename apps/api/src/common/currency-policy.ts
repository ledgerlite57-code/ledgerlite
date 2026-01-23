import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "@ledgerlite/shared";

export const ensureBaseCurrencyOnly = (
  orgBaseCurrency?: string | null,
  docCurrency?: string | null,
) => {
  if (!orgBaseCurrency) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Organization base currency is required",
      hint: "Set the organization base currency before posting.",
    });
  }

  if (!docCurrency) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Document currency is required",
      hint: "Set the document currency before posting.",
    });
  }

  if (orgBaseCurrency !== docCurrency) {
    throw new BadRequestException({
      code: ErrorCodes.MULTICURRENCY_NOT_SUPPORTED,
      message: "Multi-currency posting is not supported",
      hint: `Set the document currency to ${orgBaseCurrency} before posting.`,
      details: {
        baseCurrency: orgBaseCurrency,
        documentCurrency: docCurrency,
      },
    });
  }
};
