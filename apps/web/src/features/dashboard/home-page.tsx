"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { Button } from "../../lib/ui-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../lib/ui-table";
import { ErrorBanner } from "../../lib/ui-error-banner";
import { KpiCard } from "../../lib/ui-kpi-card";
import { DashboardOrgSetup } from "./dashboard-sections";
import { useDashboardState } from "./use-dashboard-state";

type DashboardRangeKey = "month-to-date" | "year-to-date" | "last-30-days";

const rangeOptions: Array<{ value: DashboardRangeKey; label: string }> = [
  { value: "month-to-date", label: "Month to date" },
  { value: "year-to-date", label: "Year to date" },
  { value: "last-30-days", label: "Last 30 days" },
];

type DashboardSummary = {
  range: { key: DashboardRangeKey; label: string; from: string; to: string };
  currency: string;
  bankBalances: Array<{ bankAccountId: string; name: string; currency: string; balance: string }>;
  cashBalance: string;
  arOutstanding: string;
  apOutstanding: string;
  salesTotal: string;
  expenseTotal: string;
  netProfit: string;
};

export default function DashboardHomePage() {
  const dashboard = useDashboardState();
  const [range, setRange] = useState<DashboardRangeKey>("month-to-date");
  const [refreshKey, setRefreshKey] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    if (!dashboard.org || dashboard.orgMissing) {
      setSummary(null);
      setActionError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const loadSummary = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const params = new URLSearchParams();
        params.set("range", range);
        const data = await apiFetch<DashboardSummary>(`/dashboard/summary?${params.toString()}`);
        if (active) {
          setSummary(data);
        }
      } catch (err) {
        if (active) {
          setActionError(err);
          setSummary(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadSummary();
    return () => {
      active = false;
    };
  }, [range, refreshKey, dashboard.org, dashboard.orgMissing]);

  const currency = summary?.currency ?? "AED";
  const rangeLabel = summary?.range
    ? `${summary.range.label} (${formatDate(summary.range.from)} - ${formatDate(summary.range.to)})`
    : "Summary range";

  if (!dashboard.mounted) {
    return null;
  }

  if (dashboard.orgMissing) {
    return <DashboardOrgSetup dashboard={dashboard} />;
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Home</h1>
          <p className="muted">Cash, receivables, payables, and profit snapshot.</p>
          <p className="muted">{rangeLabel}</p>
        </div>
        <div style={{ minWidth: 200 }}>
          <Select value={range} onValueChange={(value) => setRange(value as DashboardRangeKey)}>
            <SelectTrigger aria-label="Range">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={() => setRefreshKey((prev) => prev + 1)} /> : null}
      {loading ? <p>Loading dashboard summary...</p> : null}

      {summary ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <KpiCard label="Cash Balance" value={formatMoney(summary.cashBalance, currency)} />
            <KpiCard label="AR Outstanding" value={formatMoney(summary.arOutstanding, currency)} />
            <KpiCard label="AP Outstanding" value={formatMoney(summary.apOutstanding, currency)} />
            <KpiCard label="Sales Total" value={formatMoney(summary.salesTotal, currency)} />
            <KpiCard label="Expense Total" value={formatMoney(summary.expenseTotal, currency)} />
            <KpiCard label="Net Profit" value={formatMoney(summary.netProfit, currency)} />
          </div>

          <div style={{ height: 20 }} />
          <div className="section-header">
            <h2>Bank balances</h2>
            <Button variant="secondary" disabled>
              Export (Phase 7)
            </Button>
          </div>
          {summary.bankBalances.length === 0 ? <p className="muted">No bank accounts yet.</p> : null}
          {summary.bankBalances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.bankBalances.map((bank) => (
                  <TableRow key={bank.bankAccountId}>
                    <TableCell>{bank.name}</TableCell>
                    <TableCell className="text-right">{formatMoney(bank.balance, bank.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
