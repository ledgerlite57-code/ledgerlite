export type DateRangePreset = "all" | "today" | "thisWeek" | "thisMonth" | "lastMonth" | "fytd" | "custom";

export type ListFiltersState = {
  q: string;
  status: string;
  dateRange: DateRangePreset;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  customerId: string;
  vendorId: string;
};

const dateRangeValues: DateRangePreset[] = ["all", "today", "thisWeek", "thisMonth", "lastMonth", "fytd", "custom"];
const dateRangeSet = new Set(dateRangeValues);

export const DATE_RANGE_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "fytd", label: "FYTD" },
  { value: "custom", label: "Custom" },
];

export const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "SENT", label: "Sent" },
  { value: "PARTIALLY_RECEIVED", label: "Partially Received" },
  { value: "RECEIVED", label: "Received" },
  { value: "POSTED", label: "Posted" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "VOID", label: "Void" },
];

export const defaultFilters: ListFiltersState = {
  q: "",
  status: "all",
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  customerId: "",
  vendorId: "",
};

export const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const resolveDateRangePreset = (
  preset: DateRangePreset,
  today: Date = new Date(),
  fiscalYearStartMonth = 1,
) => {
  if (preset === "all") {
    return { dateFrom: "", dateTo: "" };
  }
  if (preset === "custom") {
    return { dateFrom: "", dateTo: "" };
  }

  const anchor = new Date(today);
  const to = formatDateInput(anchor);

  if (preset === "today") {
    return { dateFrom: to, dateTo: to };
  }

  if (preset === "thisWeek") {
    const day = anchor.getDay();
    const diff = (day + 6) % 7;
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - diff);
    return { dateFrom: formatDateInput(start), dateTo: to };
  }

  if (preset === "thisMonth") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { dateFrom: formatDateInput(start), dateTo: to };
  }

  if (preset === "lastMonth") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
    return { dateFrom: formatDateInput(start), dateTo: formatDateInput(end) };
  }

  const monthIndex = Math.max(0, Math.min(11, fiscalYearStartMonth - 1));
  const startYear = anchor.getMonth() >= monthIndex ? anchor.getFullYear() : anchor.getFullYear() - 1;
  const start = new Date(startYear, monthIndex, 1);
  return { dateFrom: formatDateInput(start), dateTo: to };
};

export const parseFiltersFromParams = (params: URLSearchParams): ListFiltersState => {
  const dateRangeRaw = params.get("dateRange") ?? "all";
  const dateRange = dateRangeSet.has(dateRangeRaw as DateRangePreset)
    ? (dateRangeRaw as DateRangePreset)
    : "all";

  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "all",
    dateRange,
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
    amountMin: params.get("amountMin") ?? "",
    amountMax: params.get("amountMax") ?? "",
    customerId: params.get("customerId") ?? "",
    vendorId: params.get("vendorId") ?? "",
  };
};

export const buildFilterQueryRecord = (
  filters: ListFiltersState,
  options?: { includeDateRange?: boolean },
): Record<string, string> => {
  const record: Record<string, string> = {};
  if (filters.q.trim()) {
    record.q = filters.q.trim();
  }
  if (filters.status && filters.status !== "all") {
    record.status = filters.status;
  }
  if (options?.includeDateRange && filters.dateRange && filters.dateRange !== "all") {
    record.dateRange = filters.dateRange;
  }
  if (filters.dateFrom) {
    record.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    record.dateTo = filters.dateTo;
  }
  if (filters.amountMin) {
    record.amountMin = filters.amountMin;
  }
  if (filters.amountMax) {
    record.amountMax = filters.amountMax;
  }
  if (filters.customerId) {
    record.customerId = filters.customerId;
  }
  if (filters.vendorId) {
    record.vendorId = filters.vendorId;
  }
  return record;
};
