export function getSourceHref(sourceType: string, sourceId: string) {
  switch (sourceType) {
    case "INVOICE":
      return `/invoices/${sourceId}`;
    case "BILL":
      return `/bills/${sourceId}`;
    case "CREDIT_NOTE":
      return `/credit-notes/${sourceId}`;
    case "DEBIT_NOTE":
      return `/debit-notes/${sourceId}`;
    case "PAYMENT_RECEIVED":
      return `/payments-received/${sourceId}`;
    case "VENDOR_PAYMENT":
      return `/vendor-payments/${sourceId}`;
    case "EXPENSE":
      return `/expenses/${sourceId}`;
    case "PURCHASE_ORDER":
      return `/purchase-orders/${sourceId}`;
    case "JOURNAL":
      return `/journals/${sourceId}`;
    default:
      return null;
  }
}

export function withReportContext(href: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}
