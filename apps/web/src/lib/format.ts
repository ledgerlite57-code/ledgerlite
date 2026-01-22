const currencyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatter = new Intl.DateTimeFormat("en-US");

export const formatMoney = (value: string | number, currency: string) => {
  const amount = typeof value === "string" ? Number(value) : value;
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
};

export const formatDate = (value: string | Date) => dateFormatter.format(new Date(value));
