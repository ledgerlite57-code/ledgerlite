"use client";

import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, reportRangeSchema, type ReportRangeInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type ProfitLossRow = {
  accountId: string;
  code: string;
  name: string;
  amount: string;
};

type ProfitLossResponse = {
  from: string;
  to: string;
  currency: string;
  income: { total: string; rows: ProfitLossRow[] };
  expenses: { total: string; rows: ProfitLossRow[] };
  netProfit: string;
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

const defaultRange = () => {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function ProfitLossPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  const [report, setReport] = useState<ProfitLossResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const form = useForm<ReportRangeInput>({
    resolver: zodResolver(reportRangeSchema),
    defaultValues: defaultRange(),
  });

  const loadReport = useCallback(async (values: ReportRangeInput) => {
    setLoading(true);
    try {
      setActionError(null);
      const params = new URLSearchParams();
      params.set("from", values.from.toISOString());
      params.set("to", values.to.toISOString());
      const data = await apiFetch<ProfitLossResponse>(`/reports/profit-loss?${params.toString()}`);
      setReport(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load profit and loss.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport(form.getValues());
  }, [form, loadReport]);

  const currency = report?.currency ?? "AED";

  if (!canView) {
    return (
      <div className="card">
        <h1>Profit and Loss</h1>
        <p className="muted">You do not have permission to view reports.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Profit and Loss</h1>
          <p className="muted">Income and expense summary for the period.</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(loadReport)}>
        <div className="filter-row">
          <label>
            From
            <Controller
              control={form.control}
              name="from"
              render={({ field }) => (
                <Input
                  type="date"
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.from?.message)}
          </label>
          <label>
            To
            <Controller
              control={form.control}
              name="to"
              render={({ field }) => (
                <Input
                  type="date"
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.to?.message)}
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
              <p className="muted">
                {formatDate(report.from)} to {formatDate(report.to)}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" disabled title="Export coming soon">
                Export CSV
              </Button>
              <Button variant="secondary" disabled title="Export coming soon">
                Export PDF
              </Button>
            </div>
          </div>

          <div className="section-header">
            <h2>Income</h2>
          </div>
          {report.income.rows.length === 0 ? <p className="muted">No income activity for this period.</p> : null}
          {report.income.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.income.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Income</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.income.total, currency)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Expenses</h2>
          </div>
          {report.expenses.rows.length === 0 ? <p className="muted">No expense activity for this period.</p> : null}
          {report.expenses.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.expenses.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Expenses</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.expenses.total, currency)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Net Profit</h2>
          </div>
          <p>
            <strong>{formatMoney(report.netProfit, currency)}</strong>
          </p>
        </>
      ) : null}
    </div>
  );
}
