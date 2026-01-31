export type NumberingKey = "invoice" | "bill" | "payment" | "vendorPayment";

export type NumberingFormat = {
  prefix: string;
  nextNumber: number;
};

export type NumberingFormats = Record<NumberingKey, NumberingFormat>;

type NumberingSettingsSource = {
  numberingFormats?: unknown | null;
  invoicePrefix?: string | null;
  invoiceNextNumber?: number | null;
  billPrefix?: string | null;
  billNextNumber?: number | null;
  paymentPrefix?: string | null;
  paymentNextNumber?: number | null;
  vendorPaymentPrefix?: string | null;
  vendorPaymentNextNumber?: number | null;
};

const DEFAULT_FORMATS: NumberingFormats = {
  invoice: { prefix: "INV-", nextNumber: 1 },
  bill: { prefix: "BILL-", nextNumber: 1 },
  payment: { prefix: "PAY-", nextNumber: 1 },
  vendorPayment: { prefix: "VPAY-", nextNumber: 1 },
};

const clampNextNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
};

const parseFormat = (value: unknown, fallback: NumberingFormat): NumberingFormat => {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as { prefix?: unknown; nextNumber?: unknown };
  const prefix = typeof record.prefix === "string" && record.prefix.trim().length > 0 ? record.prefix : fallback.prefix;
  const rawNext =
    typeof record.nextNumber === "number"
      ? record.nextNumber
      : typeof record.nextNumber === "string"
        ? Number(record.nextNumber)
        : fallback.nextNumber;
  return {
    prefix,
    nextNumber: clampNextNumber(rawNext),
  };
};

export const resolveNumberingFormats = (settings?: NumberingSettingsSource | null): NumberingFormats => {
  const fallback: NumberingFormats = {
    invoice: {
      prefix: settings?.invoicePrefix ?? DEFAULT_FORMATS.invoice.prefix,
      nextNumber: clampNextNumber(settings?.invoiceNextNumber ?? DEFAULT_FORMATS.invoice.nextNumber),
    },
    bill: {
      prefix: settings?.billPrefix ?? DEFAULT_FORMATS.bill.prefix,
      nextNumber: clampNextNumber(settings?.billNextNumber ?? DEFAULT_FORMATS.bill.nextNumber),
    },
    payment: {
      prefix: settings?.paymentPrefix ?? DEFAULT_FORMATS.payment.prefix,
      nextNumber: clampNextNumber(settings?.paymentNextNumber ?? DEFAULT_FORMATS.payment.nextNumber),
    },
    vendorPayment: {
      prefix: settings?.vendorPaymentPrefix ?? DEFAULT_FORMATS.vendorPayment.prefix,
      nextNumber: clampNextNumber(settings?.vendorPaymentNextNumber ?? DEFAULT_FORMATS.vendorPayment.nextNumber),
    },
  };

  const formats = settings?.numberingFormats as
    | Partial<Record<NumberingKey, NumberingFormat>>
    | undefined
    | null;

  return {
    invoice: parseFormat(formats?.invoice, fallback.invoice),
    bill: parseFormat(formats?.bill, fallback.bill),
    payment: parseFormat(formats?.payment, fallback.payment),
    vendorPayment: parseFormat(formats?.vendorPayment, fallback.vendorPayment),
  };
};

export const applyNumberingUpdate = (formats: NumberingFormats) => ({
  numberingFormats: formats,
  invoicePrefix: formats.invoice.prefix,
  invoiceNextNumber: formats.invoice.nextNumber,
  billPrefix: formats.bill.prefix,
  billNextNumber: formats.bill.nextNumber,
  paymentPrefix: formats.payment.prefix,
  paymentNextNumber: formats.payment.nextNumber,
  vendorPaymentPrefix: formats.vendorPayment.prefix,
  vendorPaymentNextNumber: formats.vendorPayment.nextNumber,
});

export const nextNumbering = (formats: NumberingFormats, key: NumberingKey) => {
  const current = formats[key];
  const assignedNumber = `${current.prefix}${current.nextNumber}`;
  const updated = {
    ...formats,
    [key]: {
      prefix: current.prefix,
      nextNumber: clampNextNumber(current.nextNumber + 1),
    },
  } as NumberingFormats;

  return { assignedNumber, nextFormats: updated };
};
