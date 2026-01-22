"use client";

import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, reportAsOfSchema, type ReportAsOfInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type BalanceSheetRow = {
  accountId: string;
  code: string;
  name: string;
  amount: string;
};

type BalanceSheetDerivedEquity = {
  netProfit: string;
  netProfitFrom: string;
  netProfitTo: string;
  computedEquity: string;
};

type BalanceSheetResponse = {
  asOf: string;
  currency: string;
  assets: { total: string; rows: BalanceSheetRow[] };
  liabilities: { total: string; rows: BalanceSheetRow[] };
  equity: { total: string; rows: BalanceSheetRow[]; derived?: BalanceSheetDerivedEquity };
  totalLiabilitiesAndEquity: string;
};

const formatDateInput = (value?: Date) => {
  if (!value) {
    return "";
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function BalanceSheetPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  const [report, setReport] = useState<BalanceSheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const form = useForm<ReportAsOfInput>({
    resolver: zodResolver(reportAsOfSchema),
    defaultValues: { asOf: new Date() },
  });

  const loadReport = useCallback(async (values: ReportAsOfInput) => {
    setLoading(true);
    try {
      setActionError(null);
      const params = new URLSearchParams();
      params.set("asOf", values.asOf.toISOString());
      const data = await apiFetch<BalanceSheetResponse>(`/reports/balance-sheet?${params.toString()}`);
      setReport(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load balance sheet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(form.getValues());
  }, [form, loadReport]);

  const currency = report?.currency ?? "AED";
  const derivedEquity = report?.equity.derived;
  const netProfit = derivedEquity?.netProfit ?? "0";
  const computedEquity = derivedEquity?.computedEquity ?? report?.equity.total ?? "0";
  const netProfitFrom = derivedEquity?.netProfitFrom ? formatDate(derivedEquity.netProfitFrom) : null;
  const netProfitTo = derivedEquity?.netProfitTo ? formatDate(derivedEquity.netProfitTo) : null;
  const netProfitTooltip = derivedEquity
    ? `Derived from income and expenses from ${netProfitFrom ?? "fiscal year start"} to ${
        netProfitTo ?? formatDate(report?.asOf ?? new Date())
      }.`
    : "Derived from income and expenses for the fiscal year to date.";

  if (!canView) {
    return (
      <div className="card">
        <h1>Balance Sheet</h1>
        <p className="muted">You do not have permission to view reports.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Balance Sheet</h1>
          <p className="muted">Assets, liabilities, and equity as of a date.</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(loadReport)}>
        <div className="filter-row">
          <label>
            As of
            <Controller
              control={form.control}
              name="asOf"
              render={({ field }) => (
                <Input
                  type="date"
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                />
              )}
            />
            {renderFieldError(form.formState.errors.asOf?.message)}
          </label>
          <div>
            <Button type="submit" disabled={loading}>
              {loading ? "Loading..." : "Apply Filters"}
            </Button>
          </div>
        </div>
      </form>

      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}

      {report ? (
        <>
          <div className="section-header">
            <div>
              <p className="muted">As of {formatDate(report.asOf)}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" disabled>
                Export CSV (Phase 2)
              </Button>
              <Button variant="secondary" disabled>
                Export PDF (Phase 2)
              </Button>
            </div>
          </div>

          <div className="section-header">
            <h2>Assets</h2>
          </div>
          {report.assets.rows.length === 0 ? <p className="muted">No asset activity yet.</p> : null}
          {report.assets.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.assets.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Assets</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.assets.total, currency)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Liabilities</h2>
          </div>
          {report.liabilities.rows.length === 0 ? <p className="muted">No liabilities recorded.</p> : null}
          {report.liabilities.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.liabilities.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Liabilities</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.liabilities.total, currency)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Equity</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.equity.rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    {row.code} - {row.name}
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <span title={netProfitTooltip}>Net Profit (Loss) (derived)</span>
                </TableCell>
                <TableCell className="text-right">{formatMoney(netProfit, currency)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <strong>Total Equity</strong>
                </TableCell>
                <TableCell className="text-right">
                  <strong>{formatMoney(report.equity.total, currency)}</strong>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="muted">Computed Equity (Assets - Liabilities)</TableCell>
                <TableCell className="text-right muted">{formatMoney(computedEquity, currency)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Totals</h2>
          </div>
          <p>
            <strong>Total Liabilities + Equity: {formatMoney(report.totalLiabilitiesAndEquity, currency)}</strong>
          </p>
        </>
      ) : null}
    </div>
  );
}
