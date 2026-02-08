"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, reportRangeSchema, type ReportRangeInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
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

type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
};

type TrialBalanceResponse = {
  from: string;
  to: string;
  currency: string;
  totals: { debit: string; credit: string };
  rows: TrialBalanceRow[];
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

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function TrialBalancePage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  const [report, setReport] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerLines, setLedgerLines] = useState<LedgerLinesResponse | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<TrialBalanceRow | null>(null);

  const form = useForm<ReportRangeInput>({
    resolver: zodResolver(reportRangeSchema),
    defaultValues: defaultRange(),
  });

  const loadReport = useCallback(
    async (values: ReportRangeInput) => {
      setLoading(true);
      try {
        setActionError(null);
        const params = new URLSearchParams();
        params.set("from", values.from.toISOString());
        params.set("to", values.to.toISOString());
        const data = await apiFetch<TrialBalanceResponse>(`/reports/trial-balance?${params.toString()}`);
        setReport(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load trial balance.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadReport(form.getValues());
  }, [form, loadReport]);

  const openLedger = async (account: TrialBalanceRow) => {
    const values = form.getValues();
    setSelectedAccount(account);
    setLedgerOpen(true);
    setLedgerLoading(true);
    try {
      setLedgerError(null);
      setLedgerLines(null);
      const params = new URLSearchParams();
      params.set("accountId", account.accountId);
      params.set("from", values.from.toISOString());
      params.set("to", values.to.toISOString());
      const data = await apiFetch<LedgerLinesResponse>(`/reports/ledger-lines?${params.toString()}`);
      setLedgerLines(data);
    } catch (err) {
      setLedgerError(err instanceof Error ? err.message : "Unable to load ledger entries.");
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleLedgerOpenChange = (open: boolean) => {
    setLedgerOpen(open);
    if (!open) {
      setSelectedAccount(null);
      setLedgerLines(null);
      setLedgerError(null);
    }
  };

  const totals = report?.totals;
  const currency = report?.currency ?? "AED";

  if (!canView) {
    return (
      <div className="card">
        <PageHeader
          title="Reports"
          heading="Trial Balance"
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
        heading="Trial Balance"
        description="Validate debit and credit totals for the period."
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <HelpDrawer
            title="Trial Balance Help"
            summary="Use Trial Balance to verify ledger parity and inspect source postings."
            buttonLabel="What this means"
          >
            <HelpSection label="Debit equals credit">
              <p>A healthy trial balance should keep total debit equal to total credit.</p>
            </HelpSection>
            <HelpSection label="Drill-down">
              <p>
                Use <TermHint term="View Entries" hint="Shows source lines posted to this account for the selected range." />{" "}
                to inspect transactions behind account totals.
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

          {report.rows.length === 0 ? (
            <EmptyState
              title="No ledger activity for this period"
              description="No posted entries were found. Try widening the range or post draft transactions first."
            />
          ) : null}

          {report.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.debit, currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.credit, currency)}</TableCell>
                  <TableCell>
                    <Button variant="secondary" onClick={() => openLedger(row)}>
                      View Entries
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
                {totals ? (
                  <TableRow>
                    <TableCell>
                      <strong>Totals</strong>
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right">
                      <strong>{formatMoney(totals.debit, currency)}</strong>
                    </TableCell>
                    <TableCell className="text-right">
                      <strong>{formatMoney(totals.credit, currency)}</strong>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          ) : null}
        </>
      ) : null}

      <Dialog open={ledgerOpen} onOpenChange={handleLedgerOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ledger entries</DialogTitle>
          </DialogHeader>
          {selectedAccount ? (
            <>
              <p className="muted">
                {selectedAccount.code} - {selectedAccount.name}
              </p>
              {ledgerError ? <p className="form-error">{ledgerError}</p> : null}
              {ledgerLoading ? <p>Loading entries...</p> : null}
              {ledgerLines && ledgerLines.lines.length === 0 ? <p className="muted">No entries for this account.</p> : null}
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
                      {ledgerLines.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>{formatDate(line.postingDate)}</TableCell>
                          <TableCell>
                            {(() => {
                              const sourceHref = getSourceHref(line.sourceType, line.sourceId);
                              if (!sourceHref) {
                                return `${line.sourceType} #${line.sourceId}`;
                              }
                              return (
                                <Link
                                  href={withReportContext(sourceHref, {
                                    fromReport: "trial-balance",
                                    reportFrom: report?.from,
                                    reportTo: report?.to,
                                  })}
                                >
                                  {line.sourceType} #{line.sourceId}
                                </Link>
                              );
                            })()}
                          </TableCell>
                          <TableCell>{line.memo ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatMoney(line.debit, line.currency)}</TableCell>
                          <TableCell className="text-right">{formatMoney(line.credit, line.currency)}</TableCell>
                        </TableRow>
                      ))}
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
