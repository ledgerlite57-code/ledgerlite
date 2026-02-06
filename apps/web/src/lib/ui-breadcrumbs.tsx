"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { apiFetch } from "./api";
import { cn } from "./utils";

type Crumb = {
  label: string;
  href?: string;
  isCurrent?: boolean;
};

type DynamicLabelFetcher = (id: string) => Promise<string | null>;

const staticLabels: Record<string, string> = {
  home: "Home",
  dashboard: "Dashboard",
  invoices: "Invoices",
  bills: "Bills",
  expenses: "Expenses",
  "payments-received": "Payments Received",
  "vendor-payments": "Vendor Payments",
  "credit-notes": "Credit Notes",
  customers: "Customers",
  vendors: "Vendors",
  items: "Items",
  accounts: "Chart of Accounts",
  taxes: "Tax Codes",
  journals: "Journals",
  "bank-accounts": "Bank Accounts",
  "bank-transactions": "Bank Transactions",
  import: "Import",
  reconciliation: "Reconciliation",
  reports: "Reports",
  "trial-balance": "Trial Balance",
  "profit-loss": "Profit & Loss",
  "balance-sheet": "Balance Sheet",
  "ar-aging": "AR Aging",
  "ap-aging": "AP Aging",
  "vat-summary": "VAT Summary",
  settings: "Settings",
  organization: "Organization",
  "audit-log": "Audit Log",
  "units-of-measurement": "Units of Measure",
  platform: "Platform",
  orgs: "Organizations",
  pdc: "PDC",
  new: "New",
};

const tabLabels: Record<string, string> = {
  overview: "Overview",
  accounts: "Chart of Accounts",
  customers: "Customers",
  vendors: "Vendors",
  items: "Items",
  taxes: "Tax Codes",
  users: "Users",
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const titleCase = (value: string) =>
  value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const fetchers: Record<string, DynamicLabelFetcher> = {
  invoices: async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/invoices/${id}`);
    return data.number ?? "Invoice";
  },
  bills: async (id) => {
    const data = await apiFetch<{ systemNumber?: string | null; number?: string | null }>(`/bills/${id}`);
    return data.systemNumber ?? data.number ?? "Bill";
  },
  expenses: async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/expenses/${id}`);
    return data.number ?? "Expense";
  },
  journals: async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/journals/${id}`);
    return data.number ?? "Journal";
  },
  "payments-received": async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/payments-received/${id}`);
    return data.number ?? "Payment";
  },
  "vendor-payments": async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/vendor-payments/${id}`);
    return data.number ?? "Vendor Payment";
  },
  "credit-notes": async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/credit-notes/${id}`);
    return data.number ?? "Credit Note";
  },
  "bank-accounts": async (id) => {
    const data = await apiFetch<{ name?: string | null }>(`/bank-accounts/${id}`);
    return data.name ?? "Bank Account";
  },
  reconciliation: async (id) => {
    const data = await apiFetch<{
      session?: { bankAccount?: { name?: string | null }; periodStart?: string; periodEnd?: string };
    }>(`/reconciliation-sessions/${id}`);
    const account = data.session?.bankAccount?.name ?? "Session";
    return `Session - ${account}`;
  },
  pdc: async (id) => {
    const data = await apiFetch<{ number?: string | null }>(`/pdc/${id}`);
    return data.number ?? "PDC";
  },
};

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  const segments = useMemo(() => pathname.split("/").filter(Boolean), [pathname]);
  const tab = searchParams.get("tab") ?? "overview";

  const pendingFetches = useMemo(() => {
    const requests: Array<{ key: string; id: string; fetcher: DynamicLabelFetcher }> = [];
    segments.forEach((segment, index) => {
      const parent = index > 0 ? segments[index - 1] : "";
      if (parent && isUuid(segment) && fetchers[parent]) {
        const key = `${parent}:${segment}`;
        requests.push({ key, id: segment, fetcher: fetchers[parent] });
      }
    });
    return requests;
  }, [segments]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const updates: Record<string, string> = {};
      for (const request of pendingFetches) {
        if (dynamicLabels[request.key]) {
          continue;
        }
        try {
          const label = await request.fetcher(request.id);
          if (label) {
            updates[request.key] = label;
          }
        } catch {
          // ignore lookup errors and keep placeholder
        }
      }
      if (active && Object.keys(updates).length > 0) {
        setDynamicLabels((prev) => ({ ...prev, ...updates }));
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [pendingFetches, dynamicLabels]);

  const crumbs = useMemo<Crumb[]>(() => {
    const items: Crumb[] = [];
    const pathParts: string[] = [];

    segments.forEach((segment, index) => {
      pathParts.push(segment);
      const href = `/${pathParts.join("/")}`;
      const isLast = index === segments.length - 1;
      const parent = index > 0 ? segments[index - 1] : "";
      let label = staticLabels[segment] ?? titleCase(segment);

      if (parent && isUuid(segment) && fetchers[parent]) {
        const key = `${parent}:${segment}`;
        label = dynamicLabels[key] ?? "Loading...";
      }

      items.push({ label, href: isLast ? undefined : href, isCurrent: isLast });
    });

    if (segments.length === 1 && segments[0] === "dashboard") {
      const tabLabel = tabLabels[tab] ?? tabLabels.overview;
      if (tabLabel && tab !== "overview") {
        items.push({ label: tabLabel, isCurrent: true });
        if (items.length > 1) {
          items[items.length - 2].isCurrent = false;
        }
      }
    }

    return items;
  }, [segments, dynamicLabels, tab]);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <nav className={cn("breadcrumbs", className)} aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className={cn("breadcrumb-item", crumb.isCurrent && "current")}>
            {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
