"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  journalCreateSchema,
  Permissions,
  type JournalCreateInput,
  type JournalLineCreateInput,
  type PaginatedResponse,
} from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDateTime, formatMoney } from "../../../../src/lib/format";
import { formatBigIntDecimal, parseDecimalToBigInt, toCents } from "../../../../src/lib/money";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";

type AccountRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  isActive: boolean;
};

type CustomerRecord = { id: string; name: string; isActive: boolean };
type VendorRecord = { id: string; name: string; isActive: boolean };

type JournalLineRecord = {
  id: string;
  lineNo: number;
  accountId: string;
  debit: string | number;
  credit: string | number;
  description?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
};

type JournalRecord = {
  id: string;
  number?: string | null;
  status: string;
  journalDate: string;
  memo?: string | null;
  updatedAt?: string;
  postedAt?: string | null;
  lines: JournalLineRecord[];
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
const showErrorToast = (title: string, error: unknown) => {
  const normalized = normalizeError(error);
  toast({
    variant: "destructive",
    title,
    description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
  });
};

export default function JournalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const journalId = params?.id ?? "";
  const isNew = journalId === "new";

  const [journal, setJournal] = useState<JournalRecord | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postError, setPostError] = useState<unknown>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [voidError, setVoidError] = useState<unknown>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.JOURNAL_WRITE);
  const canPost = hasPermission(Permissions.JOURNAL_POST);

  const form = useForm<JournalCreateInput>({
    resolver: zodResolver(journalCreateSchema),
    defaultValues: {
      journalDate: new Date(),
      memo: "",
      lines: [
        {
          accountId: "",
          description: "",
          debit: 0,
          credit: 0,
          customerId: undefined,
          vendorId: undefined,
        },
      ],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const activeAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts]);
  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.isActive), [vendors]);
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const lineValues = form.watch("lines");
  const journalDateValue = form.watch("journalDate");
  const isLocked = isDateLocked(lockDate, journalDateValue);
  const lineIssues = useMemo(() => {
    return (lineValues ?? []).map((line) => {
      const debit = parseDecimalToBigInt(line.debit ?? 0, 2);
      const credit = parseDecimalToBigInt(line.credit ?? 0, 2);
      const hasDebit = debit > 0n;
      const hasCredit = credit > 0n;
      const isNegative = debit < 0n || credit < 0n;
      const hasBoth = hasDebit && hasCredit;
      const hasNeither = !hasDebit && !hasCredit;
      let debitError: string | null = debit < 0n ? "Debit must be 0 or greater." : null;
      let creditError: string | null = credit < 0n ? "Credit must be 0 or greater." : null;
      if (hasBoth) {
        debitError = "Enter either a debit or credit.";
        creditError = "Enter either a debit or credit.";
      } else if (hasNeither) {
        debitError = "Enter a debit or credit.";
        creditError = "Enter a debit or credit.";
      }
      return {
        debit,
        credit,
        hasDebit,
        hasCredit,
        isNegative,
        hasBoth,
        hasNeither,
        isInvalid: isNegative || hasBoth || hasNeither,
        debitError,
        creditError,
      };
    });
  }, [lineValues]);

  const totals = useMemo(() => {
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const line of lineValues ?? []) {
      totalDebit += toCents(line.debit ?? 0);
      totalCredit += toCents(line.credit ?? 0);
    }
    return {
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
    };
  }, [lineValues]);

  const hasInvalidLines = lineIssues.some((line) => line.isInvalid);
  const isBalanced = totals.difference === 0n && (lineValues?.length ?? 0) >= 2;
  const canPostNow = isBalanced && !hasInvalidLines;
  const formatCents = (value: bigint) => formatMoney(formatBigIntDecimal(value, 2), orgCurrency);
  const isReadOnly = !canWrite || (!isNew && journal?.status !== "DRAFT");

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const [org, accountData, customerData, vendorData] = await Promise.all([
          apiFetch<{ baseCurrency?: string; orgSettings?: { lockDate?: string | null } }>("/orgs/current"),
          apiFetch<AccountRecord[]>("/accounts"),
          apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
          apiFetch<VendorRecord[]>("/vendors"),
        ]);
        setOrgCurrency(org.baseCurrency ?? "AED");
        setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
        setAccounts(accountData);
        setCustomers(customerData.data);
        setVendors(vendorData);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load journal references.");
      } finally {
        setLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  useEffect(() => {
    if (isNew) {
      form.reset({
        journalDate: new Date(),
        memo: "",
        lines: [
          {
            accountId: "",
            description: "",
            debit: 0,
            credit: 0,
            customerId: undefined,
            vendorId: undefined,
          },
        ],
      });
      replace([
        {
          accountId: "",
          description: "",
          debit: 0,
          credit: 0,
          customerId: undefined,
          vendorId: undefined,
        },
      ]);
      return;
    }

    const loadJournal = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<JournalRecord>(`/journals/${journalId}`);
        setJournal(data);
        const lineDefaults = data.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description ?? "",
          debit: Number(line.debit),
          credit: Number(line.credit),
          customerId: line.customerId ?? undefined,
          vendorId: line.vendorId ?? undefined,
        }));
        form.reset({
          journalDate: new Date(data.journalDate),
          memo: data.memo ?? "",
          lines: lineDefaults,
        });
        replace(lineDefaults);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load journal.");
      } finally {
        setLoading(false);
      }
    };

    loadJournal();
  }, [form, journalId, isNew, replace]);

  const submitJournal = async (values: JournalCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      if (isNew) {
        const created = await apiFetch<JournalRecord>("/journals", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
        toast({ title: "Journal draft created", description: "Draft saved successfully." });
        router.replace(`/journals/${created.id}`);
        return;
      }
      const updated = await apiFetch<JournalRecord>(`/journals/${journalId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setJournal(updated);
      toast({ title: "Journal saved", description: "Draft updates saved." });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save journal", err);
    } finally {
      setSaving(false);
    }
  };

  const postJournal = async () => {
    if (!journal || !canPost) {
      return;
    }
    setPostError(null);
    try {
      const result = await apiFetch<{ journal: JournalRecord }>(`/journals/${journal.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setJournal(result.journal);
      setPostDialogOpen(false);
      toast({ title: "Journal posted", description: "Ledger entries created." });
    } catch (err) {
      setPostError(err);
      showErrorToast("Unable to post journal", err);
    }
  };

  const voidJournal = async () => {
    if (!journal || !canPost) {
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      const result = await apiFetch<{ journal: JournalRecord }>(`/journals/${journal.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setJournal(result.journal);
      setVoidDialogOpen(false);
      toast({ title: "Journal voided", description: "A reversal entry was created." });
    } catch (err) {
      setVoidError(err);
      showErrorToast("Unable to void journal", err);
    } finally {
      setVoiding(false);
    }
  };

  if (loading) {
    return <div className="card">Loading journal...</div>;
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <h1>Journals</h1>
        <p className="muted">You do not have permission to create journals.</p>
        <Button variant="secondary" onClick={() => router.push("/journals")}>
          Back to journals
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && journal?.updatedAt ? formatDateTime(journal.updatedAt) : null;
  const postedAt = !isNew && journal?.postedAt ? formatDateTime(journal.postedAt) : null;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "New Journal" : journal?.number ?? "Draft Journal"}</h1>
          <p className="muted">
            {isNew ? "Capture journal lines and post to the ledger." : `${journal?.memo ?? "Journal entry"} | ${orgCurrency}`}
          </p>
          {!isNew && (lastSavedAt || postedAt) ? (
            <p className="muted">
              {lastSavedAt ? `Last saved at ${lastSavedAt}` : null}
              {lastSavedAt && postedAt ? " • " : null}
              {postedAt ? `Posted at ${postedAt}` : null}
            </p>
          ) : null}
        </div>
        {!isNew ? (
          <StatusChip status={journal?.status ?? "DRAFT"} />
        ) : null}
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={() => window.location.reload()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={journalDateValue} actionLabel="saving or posting" />

      <form onSubmit={form.handleSubmit(submitJournal)}>
        <div className="form-grid">
          <label>
            Journal Date *
            <Controller
              control={form.control}
              name="journalDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                />
              )}
            />
            {renderFieldError(form.formState.errors.journalDate?.message)}
          </label>
          <label>
            Memo
            <Input disabled={isReadOnly} {...form.register("memo")} />
          </label>
        </div>

        <div style={{ height: 16 }} />
        <div className="section-header">
          <div>
            <strong>Lines</strong>
            <p className="muted">Enter debits and credits. One side per line.</p>
          </div>
          <div>
            <div>Debit: {formatCents(totals.totalDebit)}</div>
            <div>Credit: {formatCents(totals.totalCredit)}</div>
            <div className={canPostNow ? "status-badge posted" : "status-badge draft"}>
              {canPostNow
                ? "Balanced"
                : hasInvalidLines
                  ? "Fix line errors"
                  : `Unbalanced by ${formatCents(totals.difference < 0n ? -totals.difference : totals.difference)}`}
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Debit</TableHead>
              <TableHead>Credit</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const line = lineValues?.[index];
              const hasCustomer = Boolean(line?.customerId);
              const hasVendor = Boolean(line?.vendorId);
              const lineIssue = lineIssues[index];

              return (
                <TableRow key={field.id} className={lineIssue?.isInvalid ? "bg-destructive/5" : undefined}>
                  <TableCell>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.accountId`}
                      render={({ field }) => (
                        <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isReadOnly}>
                          <SelectTrigger aria-label="Account">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.code} - {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(form.formState.errors.lines?.[index]?.accountId?.message)}
                  </TableCell>
                  <TableCell>
                    <Input disabled={isReadOnly} {...form.register(`lines.${index}.description`)} />
                    {renderFieldError(form.formState.errors.lines?.[index]?.description?.message)}
                  </TableCell>
                  <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isReadOnly}
                    {...form.register(`lines.${index}.debit`, { valueAsNumber: true })}
                    className={lineIssue?.debitError ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {lineIssue?.debitError ? <p className="form-error">{lineIssue.debitError}</p> : null}
                  {renderFieldError(form.formState.errors.lines?.[index]?.debit?.message)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isReadOnly}
                    {...form.register(`lines.${index}.credit`, { valueAsNumber: true })}
                    className={lineIssue?.creditError ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {lineIssue?.creditError ? <p className="form-error">{lineIssue.creditError}</p> : null}
                  {renderFieldError(form.formState.errors.lines?.[index]?.credit?.message)}
                </TableCell>
                  <TableCell>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.customerId`}
                      render={({ field }) => (
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                          disabled={isReadOnly || hasVendor}
                        >
                          <SelectTrigger aria-label="Customer">
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {activeCustomers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(form.formState.errors.lines?.[index]?.customerId?.message)}
                  </TableCell>
                  <TableCell>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.vendorId`}
                      render={({ field }) => (
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                          disabled={isReadOnly || hasCustomer}
                        >
                          <SelectTrigger aria-label="Vendor">
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {activeVendors.map((vendor) => (
                              <SelectItem key={vendor.id} value={vendor.id}>
                                {vendor.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(form.formState.errors.lines?.[index]?.vendorId?.message)}
                  </TableCell>
                  <TableCell>
                    {!isReadOnly ? (
                      <Button type="button" variant="ghost" onClick={() => remove(index)} disabled={fields.length <= 2}>
                        Remove
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {!isReadOnly ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              append({
                accountId: "",
                description: "",
                debit: 0,
                credit: 0,
                customerId: undefined,
                vendorId: undefined,
              } as JournalLineCreateInput)
            }
          >
            Add Line
          </Button>
        ) : null}

        <div style={{ height: 16 }} />
        {!isReadOnly ? (
          <Button type="submit" disabled={saving || isLocked}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
        ) : null}
      </form>

      {!isNew && journal?.status === "DRAFT" && canPost ? (
        <div style={{ marginTop: 16 }}>
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canPostNow || isLocked}>Post Journal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Journal</DialogTitle>
              </DialogHeader>
              <p>This action will post the journal and create ledger entries.</p>
              <div style={{ marginTop: 12 }}>
                <strong>Ledger Impact</strong>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lineValues ?? []).map((line, index) => {
                      const account = accountMap.get(line.accountId);
                      if (!account) {
                        return null;
                      }
                      const debit = toCents(line.debit ?? 0);
                      const credit = toCents(line.credit ?? 0);
                      return (
                        <TableRow key={`${account.id}-${index}`}>
                          <TableCell>{account.name}</TableCell>
                          <TableCell>{debit > 0n ? formatCents(debit) : "-"}</TableCell>
                          <TableCell>{credit > 0n ? formatCents(credit) : "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {postError ? <ErrorBanner error={postError} /> : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setPostDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={postJournal} disabled={!canPostNow || isLocked}>
                  Post Journal
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
      {!isNew && journal?.status === "POSTED" && canPost ? (
        <div style={{ marginTop: 16 }}>
          <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isLocked || voiding}>
                Void Journal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void journal</DialogTitle>
              </DialogHeader>
              <p>This will mark the journal as void and create a reversal entry.</p>
              {voidError ? <ErrorBanner error={voidError} /> : null}
              <div style={{ marginTop: 12 }}>
                <Button variant="secondary" onClick={() => setVoidDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={voidJournal} disabled={isLocked || voiding}>
                  {voiding ? "Voiding..." : "Confirm Void"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
