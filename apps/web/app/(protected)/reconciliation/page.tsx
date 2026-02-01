"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../src/lib/zod-resolver";
import {
  reconciliationSessionCreateSchema,
  Permissions,
  type PaginatedResponse,
  type ReconciliationSessionCreateInput,
} from "@ledgerlite/shared";
import { apiFetch } from "../../../src/lib/api";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { normalizeError } from "../../../src/lib/errors";
import { toast } from "../../../src/lib/use-toast";
import { Button } from "../../../src/lib/ui-button";
import { Input } from "../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../../src/lib/ui-sheet";
import { StatusChip } from "../../../src/lib/ui-status-chip";
import { usePermissions } from "../../../src/features/auth/use-permissions";
import { ErrorBanner } from "../../../src/lib/ui-error-banner";

type BankAccountRecord = { id: string; name: string; currency: string };

type ReconciliationSessionRecord = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  statementOpeningBalance: string | number;
  statementClosingBalance: string | number;
  bankAccount: BankAccountRecord;
};

const PAGE_SIZE = 20;

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
const showErrorToast = (title: string, error: unknown) => {
  const normalized = normalizeError(error);
  toast({
    variant: "destructive",
    title,
    description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
  });
};

export default function ReconciliationPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ReconciliationSessionRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permissions.RECONCILE_MANAGE);

  const form = useForm<ReconciliationSessionCreateInput>({
    resolver: zodResolver(reconciliationSessionCreateSchema),
    defaultValues: {
      bankAccountId: "",
      periodStart: new Date(),
      periodEnd: new Date(),
      statementOpeningBalance: 0,
      statementClosingBalance: 0,
    },
  });

  const loadData = async (page = pageInfo.page) => {
    setLoading(true);
    try {
      setActionError(null);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const [sessionData, bankResult] = await Promise.all([
        apiFetch<PaginatedResponse<ReconciliationSessionRecord>>(`/reconciliation-sessions?${params.toString()}`),
        apiFetch<BankAccountRecord[] | PaginatedResponse<BankAccountRecord>>("/bank-accounts"),
      ]);
      setSessions(sessionData.data);
      setPageInfo(sessionData.pageInfo);
      const bankData = Array.isArray(bankResult) ? bankResult : bankResult.data ?? [];
      setBankAccounts(bankData);
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to load reconciliation sessions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);

  const handlePageChange = (nextPage: number) => {
    loadData(nextPage);
  };

  const submitSession = async (values: ReconciliationSessionCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      const created = await apiFetch<ReconciliationSessionRecord>("/reconciliation-sessions", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(values),
      });
      setSheetOpen(false);
      toast({ title: "Reconciliation session created", description: "Session is ready for matching." });
      await loadData();
      form.reset();
      router.push(`/reconciliation/${created.id}`);
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to create reconciliation session", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Reconciliation</h1>
          <p className="muted">Match bank statement lines to ledger postings.</p>
        </div>
        {canManage ? (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button onClick={() => setSheetOpen(true)}>New Session</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create reconciliation session</SheetTitle>
              </SheetHeader>
              <form onSubmit={form.handleSubmit(submitSession)}>
                <div className="form-grid">
                  <label>
                    Bank Account *
                    <Controller
                      control={form.control}
                      name="bankAccountId"
                      render={({ field }) => (
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Bank account">
                            <SelectValue placeholder="Select bank account" />
                          </SelectTrigger>
                          <SelectContent>
                            {bankAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name} ({account.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(form.formState.errors.bankAccountId?.message)}
                  </label>
                  <label>
                    Period Start *
                    <Controller
                      control={form.control}
                      name="periodStart"
                      render={({ field }) => (
                        <Input
                          type="date"
                          value={formatDateInput(field.value)}
                          onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                        />
                      )}
                    />
                    {renderFieldError(form.formState.errors.periodStart?.message)}
                  </label>
                  <label>
                    Period End *
                    <Controller
                      control={form.control}
                      name="periodEnd"
                      render={({ field }) => (
                        <Input
                          type="date"
                          value={formatDateInput(field.value)}
                          onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                        />
                      )}
                    />
                    {renderFieldError(form.formState.errors.periodEnd?.message)}
                  </label>
                  <label>
                    Statement Opening Balance *
                    <Input
                      type="number"
                      step="0.01"
                      {...form.register("statementOpeningBalance", { valueAsNumber: true })}
                    />
                    {renderFieldError(form.formState.errors.statementOpeningBalance?.message)}
                  </label>
                  <label>
                    Statement Closing Balance *
                    <Input
                      type="number"
                      step="0.01"
                      {...form.register("statementClosingBalance", { valueAsNumber: true })}
                    />
                    {renderFieldError(form.formState.errors.statementClosingBalance?.message)}
                  </label>
                </div>
                <div style={{ height: 12 }} />
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create Session"}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={loadData} /> : null}
      {loading ? <p>Loading sessions...</p> : null}
      {!loading && sessions.length === 0 ? <p>No reconciliation sessions yet.</p> : null}

      {sessions.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Account</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Opening</TableHead>
                <TableHead>Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <Link href={`/reconciliation/${session.id}`}>{session.bankAccount?.name ?? "-"}</Link>
                  </TableCell>
                  <TableCell>
                    {formatDate(session.periodStart)} to {formatDate(session.periodEnd)}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={session.status} />
                  </TableCell>
                  <TableCell>
                    {formatMoney(session.statementOpeningBalance ?? 0, session.bankAccount?.currency ?? "AED")}
                  </TableCell>
                  <TableCell>
                    {formatMoney(session.statementClosingBalance ?? 0, session.bankAccount?.currency ?? "AED")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <div className="muted">Showing {sessions.length} of {pageInfo.total}</div>
              <div className="muted">
                Page {pageInfo.page} of {pageCount}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => handlePageChange(Math.max(1, pageInfo.page - 1))}
                disabled={pageInfo.page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePageChange(Math.min(pageCount, pageInfo.page + 1))}
                disabled={pageInfo.page >= pageCount || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
