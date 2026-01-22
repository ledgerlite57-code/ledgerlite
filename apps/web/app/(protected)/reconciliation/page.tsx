"use client";

import { useEffect, useState } from "react";
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
import { Button } from "../../../src/lib/ui-button";
import { Input } from "../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../../src/lib/ui-sheet";
import { usePermissions } from "../../../src/features/auth/use-permissions";

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

export default function ReconciliationPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ReconciliationSessionRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const loadData = async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [sessionData, bankData] = await Promise.all([
        apiFetch<PaginatedResponse<ReconciliationSessionRecord>>("/reconciliation-sessions"),
        apiFetch<BankAccountRecord[]>("/bank-accounts"),
      ]);
      setSessions(sessionData.data);
      setBankAccounts(bankData);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load reconciliation sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      await loadData();
      form.reset();
      router.push(`/reconciliation/${created.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to create reconciliation session.");
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
                          onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
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
                          onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
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

      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p>Loading sessions...</p> : null}
      {!loading && sessions.length === 0 ? <p>No reconciliation sessions yet.</p> : null}

      {sessions.length > 0 ? (
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
                  <span className={`status-badge ${session.status.toLowerCase()}`}>{session.status}</span>
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
      ) : null}
    </div>
  );
}
