"use client";

import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, reportRangeSchema, type ReportRangeInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
import { BarChart3 } from "lucide-react";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { PageHeader } from "../../../../src/lib/ui-page-header";

type VatAccountRow = {
  accountId: string;
  code: string;
  name: string;
  amount: string;
};

type VatSummaryResponse = {
  from: string;
  to: string;
  currency: string;
  outputVat: { total: string; accounts: VatAccountRow[] };
  inputVat: { total: string; accounts: VatAccountRow[] };
  netVat: string;
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

export default function VatSummaryPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  const [report, setReport] = useState<VatSummaryResponse | null>(null);
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
      const data = await apiFetch<VatSummaryResponse>(`/reports/vat-summary?${params.toString()}`);
      setReport(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load VAT summary.");
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
        <PageHeader
          title="Reports"
          heading="VAT Summary"
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
        heading="VAT Summary"
        description="Output and input VAT for the period."
        icon={<BarChart3 className="h-5 w-5" />}
      />

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
            <h2>Output VAT</h2>
          </div>
          {report.outputVat.accounts.length === 0 ? <p className="muted">No output VAT entries.</p> : null}
          {report.outputVat.accounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.outputVat.accounts.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Output VAT</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.outputVat.total, currency)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Input VAT</h2>
          </div>
          {report.inputVat.accounts.length === 0 ? <p className="muted">No input VAT entries.</p> : null}
          {report.inputVat.accounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.inputVat.accounts.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      {row.code} - {row.name}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.amount, currency)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Total Input VAT</strong>
                  </TableCell>
                  <TableCell className="text-right">
                    <strong>{formatMoney(report.inputVat.total, currency)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : null}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Net VAT</h2>
          </div>
          <p>
            <strong>{formatMoney(report.netVat, currency)}</strong>
          </p>
        </>
      ) : null}
    </div>
  );
}
