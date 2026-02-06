type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "currency") => string[];
};

const fallbackCurrencyCodes = [
  "AED",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "SAR",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "JPY",
  "SGD",
  "HKD",
  "NZD",
  "ZAR",
  "EGP",
  "PKR",
  "BDT",
  "LKR",
  "MYR",
  "IDR",
  "THB",
  "PHP",
  "NGN",
  "KES",
  "TRY",
];

const readSupportedCurrencies = () => {
  const intl = Intl as IntlWithSupportedValues;
  if (typeof intl.supportedValuesOf === "function") {
    try {
      const values = intl.supportedValuesOf("currency");
      if (Array.isArray(values) && values.length > 0) {
        return values.map((code) => code.toUpperCase());
      }
    } catch {
      // fall back to static list
    }
  }
  return fallbackCurrencyCodes;
};

export const currencyCodes = Array.from(new Set(readSupportedCurrencies())).sort();

export const currencyOptions = currencyCodes.map((code) => ({
  value: code,
  label: code,
}));
