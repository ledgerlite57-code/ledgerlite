const pow10 = (scale: number) => 10n ** BigInt(scale);

export const parseDecimalToBigInt = (value: string | number | null | undefined, scale = 2) => {
  if (value === null || value === undefined || value === "") {
    return 0n;
  }
  const raw = typeof value === "number" ? value.toString() : String(value);
  const text = raw.trim();
  if (!text) {
    return 0n;
  }
  if (text.includes("e") || text.includes("E")) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) {
      return 0n;
    }
    return BigInt(Math.round(numeric * 10 ** scale));
  }
  const negative = text.startsWith("-");
  const normalized = negative ? text.slice(1) : text;
  const [wholeRaw, fracRaw = ""] = normalized.split(".");
  const whole = wholeRaw.replace(/[^0-9]/g, "") || "0";
  const frac = fracRaw.replace(/[^0-9]/g, "").padEnd(scale, "0").slice(0, scale);
  const scaled = BigInt(whole) * pow10(scale) + BigInt(frac || "0");
  return negative ? -scaled : scaled;
};

export const formatBigIntDecimal = (value: bigint, scale = 2) => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = pow10(scale);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole.toString()}${scale > 0 ? `.${frac}` : ""}`;
};

export const toCents = (value: string | number | null | undefined) => parseDecimalToBigInt(value, 2);

export const multiplyScaled = (a: bigint, b: bigint, scale: number) => {
  const divisor = pow10(scale);
  const half = divisor / 2n;
  const product = a * b;
  if (product >= 0n) {
    return (product + half) / divisor;
  }
  return -(((-product) + half) / divisor);
};

export const calculateGrossCents = (qty: string | number | null | undefined, unitPrice: string | number | null | undefined) => {
  const qtyScaled = parseDecimalToBigInt(qty, 4);
  const priceCents = toCents(unitPrice);
  return multiplyScaled(qtyScaled, priceCents, 4);
};

export const calculateTaxCents = (amountCents: bigint, rate: string | number | null | undefined) => {
  const rateScaled = parseDecimalToBigInt(rate, 4);
  const divisor = 1000000n;
  const half = divisor / 2n;
  const product = amountCents * rateScaled;
  if (product >= 0n) {
    return (product + half) / divisor;
  }
  return -(((-product) + half) / divisor);
};
