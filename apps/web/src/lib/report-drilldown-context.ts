export type ReportContextKey = "profit-loss" | "trial-balance" | "ar-aging" | "ap-aging";

type SearchParamReader = {
  get(name: string): string | null;
};

type ReportConfig = {
  label: string;
  path: string;
  kind: "range" | "asOf";
};

const REPORT_CONFIG: Record<ReportContextKey, ReportConfig> = {
  "profit-loss": { label: "Profit and Loss", path: "/reports/profit-loss", kind: "range" },
  "trial-balance": { label: "Trial Balance", path: "/reports/trial-balance", kind: "range" },
  "ar-aging": { label: "AR Aging", path: "/reports/ar-aging", kind: "asOf" },
  "ap-aging": { label: "AP Aging", path: "/reports/ap-aging", kind: "asOf" },
};

const isReportContextKey = (value: string): value is ReportContextKey => {
  return value === "profit-loss" || value === "trial-balance" || value === "ar-aging" || value === "ap-aging";
};

const normalizeDateParam = (value: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const pickDateParam = (params: SearchParamReader, names: string[]) => {
  for (const name of names) {
    const normalized = normalizeDateParam(params.get(name));
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

export type ReportDrilldownContext = {
  key: ReportContextKey;
  label: string;
  href: string;
  from: string | null;
  to: string | null;
  asOf: string | null;
};

export function getReportDrilldownContext(params: SearchParamReader): ReportDrilldownContext | null {
  const fromReport = params.get("fromReport");
  if (!fromReport || !isReportContextKey(fromReport)) {
    return null;
  }

  const config = REPORT_CONFIG[fromReport];
  const from = pickDateParam(params, ["from", "reportFrom"]);
  const to = pickDateParam(params, ["to", "reportTo"]);
  const asOf = pickDateParam(params, ["asOf", "reportAsOf"]);

  const query = new URLSearchParams();
  if (config.kind === "range") {
    if (from) {
      query.set("from", from);
    }
    if (to) {
      query.set("to", to);
    }
  } else if (asOf) {
    query.set("asOf", asOf);
  }

  const qs = query.toString();
  return {
    key: fromReport,
    label: config.label,
    href: qs ? `${config.path}?${qs}` : config.path,
    from,
    to,
    asOf,
  };
}
