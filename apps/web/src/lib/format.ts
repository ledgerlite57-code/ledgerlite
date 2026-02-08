const currencyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
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
  const normalizedCurrency = (currency ?? "").trim().toUpperCase();
  const resolvedCurrency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : "AED";
  let formatter = currencyFormatters.get(resolvedCurrency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: resolvedCurrency,
        currencyDisplay: "code",
      });
    } catch {
      formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "AED", currencyDisplay: "code" });
    }
    currencyFormatters.set(resolvedCurrency, formatter);
  }
  return formatter.format(amount);
};

const parseDateSafely = (value: string | Date | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: string | Date | null | undefined, fallback = "-") => {
  const date = parseDateSafely(value);
  return date ? dateFormatter.format(date) : fallback;
};

export const formatDateTime = (value: string | Date | null | undefined, fallback = "-") => {
  const date = parseDateSafely(value);
  return date ? dateTimeFormatter.format(date) : fallback;
};
