"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, reportAgingSchema, type ReportAgingInput } from "@ledgerlite/shared";
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
import { withReportContext } from "../../../../src/lib/report-source-links";

type AgingTotals = {
  current: string;
  days1To30: string;
  days31To60: string;
  days61To90: string;
  days91Plus: string;
};

type AgingLine = {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  outstanding: string;
  bucket: string;
  ageDays: number;
};

type AgingParty = {
  id: string;
  name: string;
  totals: AgingTotals;
  lines: AgingLine[];
};

type AgingResponse = {
  asOf: string;
  currency: string;
  totals: AgingTotals;
  customers: AgingParty[];
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

const bucketLabels: Record<keyof AgingTotals, string> = {
  current: "Current",
  days1To30: "1-30",
  days31To60: "31-60",
  days61To90: "61-90",
  days91Plus: "91+",
};

export default function ArAgingPage() {
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  const [report, setReport] = useState<AgingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<AgingParty | null>(null);

  const initialAsOf = useMemo(
    () => parseDate(searchParams.get("asOf") ?? searchParams.get("reportAsOf")) ?? new Date(),
    [searchParamString, searchParams],
  );

  const form = useForm<ReportAgingInput>({
    resolver: zodResolver(reportAgingSchema),
    defaultValues: { asOf: initialAsOf },
  });

  const loadReport = useCallback(async (values: ReportAgingInput) => {
    setLoading(true);
    try {
      setActionError(null);
      const params = new URLSearchParams();
      params.set("asOf", values.asOf.toISOString());
      const data = await apiFetch<AgingResponse>(`/reports/ar-aging?${params.toString()}`);
      setReport(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load AR aging.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    form.reset({ asOf: initialAsOf });
    loadReport({ asOf: initialAsOf });
  }, [form, initialAsOf, loadReport]);

  const currency = report?.currency ?? "AED";

  const openDetails = (party: AgingParty) => {
    setSelectedParty(party);
    setDetailOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedParty(null);
    }
  };

  if (!canView) {
    return (
      <div className="card">
        <PageHeader
          title="Reports"
          heading="AR Aging"
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
        heading="AR Aging"
        description="Outstanding receivables by aging bucket."
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <HelpDrawer
            title="AR Aging Help"
            summary="Track customer receivables by overdue bucket."
            buttonLabel="What this means"
          >
            <HelpSection label="Buckets">
              <p>Current means not overdue. Older buckets indicate higher collection risk.</p>
            </HelpSection>
            <HelpSection label="Details">
              <p>
                Use <TermHint term="View" hint="Opens invoice-level outstanding lines for the selected customer." /> to trace
                balances to source invoices.
              </p>
            </HelpSection>
          </HelpDrawer>
        }
      />

      {form.formState.submitCount > 0 ? <ValidationSummary errors={form.formState.errors} /> : null}
      <form onSubmit={form.handleSubmit(loadReport)}>
        <div className="filter-row">
          <label>
            As of
            <Controller
              control={form.control}
              name="asOf"
              render={({ field }) => (
                <Input
                  id="field-asof"
                  type="date"
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
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
              <Button variant="secondary" disabled title="Export coming soon">
                Export CSV
              </Button>
              <Button variant="secondary" disabled title="Export coming soon">
                Export PDF
              </Button>
            </div>
          </div>

          {report.customers.length === 0 ? (
            <EmptyState title="No outstanding receivables" description="All customer balances are settled for this date." />
          ) : null}
          {report.customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">{bucketLabels.current}</TableHead>
                  <TableHead className="text-right">{bucketLabels.days1To30}</TableHead>
                  <TableHead className="text-right">{bucketLabels.days31To60}</TableHead>
                  <TableHead className="text-right">{bucketLabels.days61To90}</TableHead>
                  <TableHead className="text-right">{bucketLabels.days91Plus}</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>{customer.name}</TableCell>
                    <TableCell className="text-right">{formatMoney(customer.totals.current, currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(customer.totals.days1To30, currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(customer.totals.days31To60, currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(customer.totals.days61To90, currency)}</TableCell>
                    <TableCell className="text-right">{formatMoney(customer.totals.days91Plus, currency)}</TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => openDetails(customer)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Totals</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.totals.current, currency)}</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.totals.days1To30, currency)}</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.totals.days31To60, currency)}</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.totals.days61To90, currency)}</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.totals.days91Plus, currency)}</strong>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          ) : null}
        </>
      ) : null}

      <Dialog open={detailOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer aging details</DialogTitle>
          </DialogHeader>
          {selectedParty ? (
            <>
              <p className="muted">{selectedParty.name}</p>
              {selectedParty.lines.length === 0 ? (
                <EmptyState title="No outstanding items" description="This customer has no open invoices as of this date." />
              ) : null}
              {selectedParty.lines.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedParty.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Link
                            href={withReportContext(`/invoices/${line.id}`, {
                              fromReport: "ar-aging",
                              reportAsOf: report?.asOf,
                            })}
                          >
                            {line.number}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(line.invoiceDate)}</TableCell>
                        <TableCell>{formatDate(line.dueDate)}</TableCell>
                        <TableCell>{bucketLabels[line.bucket as keyof AgingTotals] ?? line.bucket}</TableCell>
                        <TableCell className="text-right">{formatMoney(line.outstanding, line.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
