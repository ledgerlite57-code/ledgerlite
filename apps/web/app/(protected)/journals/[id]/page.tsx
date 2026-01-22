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
import { formatMoney } from "../../../../src/lib/format";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../../src/lib/ui-status-chip";

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

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
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
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lineValues ?? []) {
      totalDebit = roundMoney(totalDebit + Number(line.debit ?? 0));
      totalCredit = roundMoney(totalCredit + Number(line.credit ?? 0));
    }
    return {
      totalDebit,
      totalCredit,
      difference: roundMoney(totalDebit - totalCredit),
    };
  }, [lineValues]);

  const isBalanced = totals.difference === 0 && (lineValues?.length ?? 0) >= 2;
  const isReadOnly = !canWrite || (!isNew && journal?.status !== "DRAFT");

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const [org, accountData, customerData, vendorData] = await Promise.all([
          apiFetch<{ baseCurrency?: string }>("/orgs/current"),
          apiFetch<AccountRecord[]>("/accounts"),
          apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
          apiFetch<VendorRecord[]>("/vendors"),
        ]);
        setOrgCurrency(org.baseCurrency ?? "AED");
        setAccounts(accountData);
        setCustomers(customerData.data);
        setVendors(vendorData);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load journal references.");
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
        setActionError(err instanceof Error ? err.message : "Unable to load journal.");
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
        router.replace(`/journals/${created.id}`);
        return;
      }
      const updated = await apiFetch<JournalRecord>(`/journals/${journalId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setJournal(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save journal.");
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
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Unable to post journal.");
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

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "New Journal" : journal?.number ?? "Draft Journal"}</h1>
          <p className="muted">
            {isNew ? "Capture journal lines and post to the ledger." : `${journal?.memo ?? "Journal entry"} | ${orgCurrency}`}
          </p>
        </div>
        {!isNew ? (
          <StatusChip status={journal?.status ?? "DRAFT"} />
        ) : null}
      </div>

      {actionError ? <p className="form-error">{actionError}</p> : null}

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
            <div>Debit: {formatMoney(totals.totalDebit, orgCurrency)}</div>
            <div>Credit: {formatMoney(totals.totalCredit, orgCurrency)}</div>
            <div className={isBalanced ? "status-badge posted" : "status-badge draft"}>
              {isBalanced ? "Balanced" : `Difference ${formatMoney(Math.abs(totals.difference), orgCurrency)}`}
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

              return (
                <TableRow key={field.id}>
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
                    />
                    {renderFieldError(form.formState.errors.lines?.[index]?.debit?.message)}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isReadOnly}
                      {...form.register(`lines.${index}.credit`, { valueAsNumber: true })}
                    />
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
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
        ) : null}
      </form>

      {!isNew && journal?.status === "DRAFT" && canPost ? (
        <div style={{ marginTop: 16 }}>
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!isBalanced}>Post Journal</Button>
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
                      return (
                        <TableRow key={`${account.id}-${index}`}>
                          <TableCell>{account.name}</TableCell>
                          <TableCell>{line.debit ? formatMoney(Number(line.debit), orgCurrency) : "-"}</TableCell>
                          <TableCell>{line.credit ? formatMoney(Number(line.credit), orgCurrency) : "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {postError ? <p className="form-error">{postError}</p> : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setPostDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={postJournal} disabled={!isBalanced}>
                  Post Journal
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
