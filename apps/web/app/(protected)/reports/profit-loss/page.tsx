"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, reportRangeSchema, type ReportRangeInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
import { formatBigIntDecimal, toCents } from "../../../../src/lib/money";
import { BarChart3 } from "lucide-react";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../src/lib/ui-dialog";
import { ValidationSummary } from "../../../../src/lib/ui-validation-summary";
import { EmptyState } from "../../../../src/lib/ui-empty-state";
import { HelpDrawer, HelpSection, TermHint } from "../../../../src/lib/ui-help-drawer";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { getSourceHref, withReportContext } from "../../../../src/lib/report-source-links";

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

type LedgerLine = {
  id: string;
  postingDate: string;
  sourceType: string;
  sourceId: string;
  memo?: string | null;
  debit: string;
  credit: string;
  currency: string;
};

type LedgerLinesResponse = {
  accountId: string;
  from: string;
  to: string;
  totals: { debit: string; credit: string };
  lines: LedgerLine[];
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

const parseDate = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function ProfitLossPage() {
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  const [report, setReport] = useState<ProfitLossResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerLines, setLedgerLines] = useState<LedgerLinesResponse | null>(null);
  const [selectedRow, setSelectedRow] = useState<ProfitLossRow | null>(null);
  const [selectedRowSection, setSelectedRowSection] = useState<"income" | "expense" | null>(null);

  const initialRange = useMemo(() => {
    const from = parseDate(searchParams.get("from") ?? searchParams.get("reportFrom"));
    const to = parseDate(searchParams.get("to") ?? searchParams.get("reportTo"));
    if (from && to) {
      return { from, to };
    }
    return defaultRange();
  }, [searchParamString, searchParams]);

  const form = useForm<ReportRangeInput>({
    resolver: zodResolver(reportRangeSchema),
    defaultValues: initialRange,
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
    form.reset(initialRange);
    loadReport(initialRange);
  }, [form, initialRange, loadReport]);

  const openLedger = async (row: ProfitLossRow, section: "income" | "expense") => {
    const values = form.getValues();
    setSelectedRow(row);
    setSelectedRowSection(section);
    setLedgerOpen(true);
    setLedgerLoading(true);
    try {
      setLedgerError(null);
      setLedgerLines(null);
      const params = new URLSearchParams();
      params.set("accountId", row.accountId);
      params.set("from", values.from.toISOString());
      params.set("to", values.to.toISOString());
      const data = await apiFetch<LedgerLinesResponse>(`/reports/ledger-lines?${params.toString()}`);
      setLedgerLines(data);
    } catch (err) {
      setLedgerError(err instanceof Error ? err.message : "Unable to load account entries.");
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleLedgerOpenChange = (open: boolean) => {
    setLedgerOpen(open);
    if (!open) {
      setSelectedRow(null);
      setSelectedRowSection(null);
      setLedgerLines(null);
      setLedgerError(null);
    }
  };

  const ledgerVariance = useMemo(() => {
    if (!selectedRow || !selectedRowSection || !ledgerLines) {
      return null;
    }
    const expected = toCents(selectedRow.amount);
    const debit = toCents(ledgerLines.totals.debit);
    const credit = toCents(ledgerLines.totals.credit);
    const actual = selectedRowSection === "income" ? credit - debit : debit - credit;
    const delta = actual - expected;
    return {
      expected,
      actual,
      delta,
      isMismatch: delta !== 0n,
      contextId: `PL-${selectedRow.accountId}-${ledgerLines.from}-${ledgerLines.to}`,
    };
  }, [ledgerLines, selectedRow, selectedRowSection]);

  const currency = report?.currency ?? "AED";

  if (!canView) {
    return (
      <div className="card">
        <PageHeader
          title="Reports"
          heading="Profit and Loss"
          description="You do not have permission to view reports."
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Reports"
        heading="Profit and Loss"
        description="Income and expense summary for the period."
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <HelpDrawer
            title="Profit and Loss Help"
            summary="Use this report to review profitability and drill into source transactions."
            buttonLabel="What this means"
          >
            <HelpSection label="How to read this report">
              <p>Income minus expenses equals net profit for the selected period.</p>
            </HelpSection>
            <HelpSection label="Drill-down">
              <p>
                Click <TermHint term="View Entries" hint="Opens account-level source postings for this report range." /> to
                inspect source documents behind each account total.
              </p>
            </HelpSection>
          </HelpDrawer>
        }
      />

      {form.formState.submitCount > 0 ? <ValidationSummary errors={form.formState.errors} /> : null}
      <form onSubmit={form.handleSubmit(loadReport)}>
        <div className="filter-row">
          <label>
            From
            <Controller
              control={form.control}
              name="from"
              render={({ field }) => (
                <Input
                  id="field-from"
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
                  id="field-to"
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
          {report.income.rows.length === 0 ? (
            <EmptyState
              title="No income activity"
              description="No income postings were found for this period. Try widening the date range."
            />
          ) : null}
          {report.income.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.income.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => openLedger(row, "income")}>
                        View Entries
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Income</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.income.total, currency)}</strong>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Expenses</h2>
          </div>
          {report.expenses.rows.length === 0 ? (
            <EmptyState
              title="No expense activity"
              description="No expense postings were found for this period. Try widening the date range."
            />
          ) : null}
          {report.expenses.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.expenses.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => openLedger(row, "expense")}>
                        View Entries
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Expenses</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.expenses.total, currency)}</strong>
                  </TableCell>
                  <TableCell />
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

      <Dialog open={ledgerOpen} onOpenChange={handleLedgerOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account entries</DialogTitle>
          </DialogHeader>
          {selectedRow ? (
            <>
              <p className="muted">
                {selectedRow.code} - {selectedRow.name}
              </p>
              {ledgerError ? <p className="form-error">{ledgerError}</p> : null}
              {ledgerLoading ? <p>Loading entries...</p> : null}
              {ledgerVariance?.isMismatch ? (
                <div className="card" style={{ marginTop: 8 }}>
                  <p className="form-error">Variance detected between report row total and drill-down totals.</p>
                  <p className="muted text-xs">
                    Expected: {formatMoney(formatBigIntDecimal(ledgerVariance.expected, 2), currency)} | Drill-down:{" "}
                    {formatMoney(formatBigIntDecimal(ledgerVariance.actual, 2), currency)} | Delta:{" "}
                    {formatMoney(formatBigIntDecimal(ledgerVariance.delta, 2), currency)}
                  </p>
                  <p className="muted text-xs">Context ID: {ledgerVariance.contextId}</p>
                </div>
              ) : null}
              {ledgerLines && ledgerLines.lines.length === 0 ? (
                <EmptyState
                  title="No entries for this account"
                  description="No source transactions were found for this account in the selected range."
                />
              ) : null}
              {ledgerLines && ledgerLines.lines.length > 0 ? (
                <div style={{ maxHeight: 360, overflow: "auto" }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerLines.lines.map((line) => {
                        const sourceHref = getSourceHref(line.sourceType, line.sourceId);
                        const reportFrom = report?.from;
                        const reportTo = report?.to;
                        return (
                          <TableRow key={line.id}>
                            <TableCell>{formatDate(line.postingDate)}</TableCell>
                            <TableCell>
                              {sourceHref ? (
                                <Link
                                  href={withReportContext(sourceHref, {
                                    fromReport: "profit-loss",
                                    reportFrom,
                                    reportTo,
                                  })}
                                >
                                  {line.sourceType} #{line.sourceId}
                                </Link>
                              ) : (
                                `${line.sourceType} #${line.sourceId}`
                              )}
                            </TableCell>
                            <TableCell>{line.memo ?? "-"}</TableCell>
                            <TableCell className="text-right">{formatMoney(line.debit, line.currency)}</TableCell>
                            <TableCell className="text-right">{formatMoney(line.credit, line.currency)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
