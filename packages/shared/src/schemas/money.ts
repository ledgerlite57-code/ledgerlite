import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const decimalRegex = /^-?\d+(\.\d+)?$/;

const decimalStringSchema = z.string().regex(decimalRegex, "Must be a valid decimal number");
const decimalNumberSchema = z.number().finite();
const decimalSchema = z.union([decimalNumberSchema, decimalStringSchema]);

const toNumber = (value: string | number) => (typeof value === "number" ? value : Number(value));

const nonNegativeSchema = decimalSchema.refine((value) => toNumber(value) >= 0, {
  message: "Must be greater than or equal to 0",
});

const positiveSchema = decimalSchema.refine((value) => toNumber(value) > 0, {
  message: "Must be greater than 0",
});

const signedSchema = decimalSchema;

const optionalNonNegativeSchema = z.preprocess(emptyToUndefined, nonNegativeSchema.optional());
const optionalPositiveSchema = z.preprocess(emptyToUndefined, positiveSchema.optional());
const optionalSignedSchema = z.preprocess(emptyToUndefined, signedSchema.optional());

const rateSchema = decimalSchema.refine((value) => {
  const numeric = toNumber(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100;
}, {
  message: "Rate must be between 0 and 100",
});

export {
  decimalSchema,
  nonNegativeSchema,
  positiveSchema,
  signedSchema,
  optionalNonNegativeSchema,
  optionalPositiveSchema,
  optionalSignedSchema,
  rateSchema,
};

export const moneySchema = nonNegativeSchema;
export const moneyPositiveSchema = positiveSchema;
export const optionalMoneySchema = optionalNonNegativeSchema;
export const optionalMoneyPositiveSchema = optionalPositiveSchema;
export const signedMoneySchema = signedSchema;
export const optionalSignedMoneySchema = optionalSignedSchema;
export const quantitySchema = positiveSchema;
export const optionalQuantitySchema = optionalNonNegativeSchema;
export const exchangeRateSchema = positiveSchema;
export const optionalExchangeRateSchema = z.preprocess(emptyToUndefined, exchangeRateSchema.optional());
export const percentageSchema = rateSchema;
