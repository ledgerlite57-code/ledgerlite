const currencyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

export const parseApiDecimalSafely = (value?: string | number | null, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatMoney = (value: string | number, currency: string) => {
  const amount = parseApiDecimalSafely(value);
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
};

export const formatDate = (value: string | Date) => dateFormatter.format(new Date(value));
