"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Permissions, type CreditNoteApplyInput, type PaginatedResponse } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatDateTime, formatMoney } from "../../../../src/lib/format";
import { normalizeError } from "../../../../src/lib/errors";
import { formatBigIntDecimal, toCents } from "../../../../src/lib/money";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { Input } from "../../../../src/lib/ui-input";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { PostImpactSummary } from "../../../../src/lib/ui-post-impact-summary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type CreditNoteLineRecord = {
  id: string;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  lineTax: string | number;
  lineTotal: string | number;
  item?: { id: string; name: string } | null;
  taxCode?: { id: string; name: string } | null;
};

type InvoiceRecord = {
  id: string;
  number?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  currency: string;
  total: string | number;
  amountPaid?: string | number | null;
};

type AllocationRecord = {
  id: string;
  invoiceId: string;
  amount: string | number;
  invoice: InvoiceRecord;
};

type CreditNoteRecord = {
  id: string;
  number?: string | null;
  status: string;
  customerId: string;
  invoiceId?: string | null;
  creditNoteDate: string;
  currency: string;
  exchangeRate?: string | number | null;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  reference?: string | null;
  notes?: string | null;
  postedAt?: string | null;
  voidedAt?: string | null;
  updatedAt?: string | null;
  customer?: { id: string; name: string } | null;
  lines: CreditNoteLineRecord[];
  allocations?: AllocationRecord[];
};

type OrgSettingsResponse = {
  baseCurrency?: string;
  orgSettings?: { lockDate?: string | null };
};

const computeOutstanding = (invoice: InvoiceRecord) => {
  const totalCents = toCents(invoice.total ?? 0);
  const paidCents = toCents(invoice.amountPaid ?? 0);
  const remaining = totalCents - paidCents;
  return remaining > 0n ? remaining : 0n;
};

const formatCents = (value: bigint, currency: string) => formatMoney(formatBigIntDecimal(value, 2), currency);

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const creditNoteId = params?.id ?? "";
  const { hasPermission } = usePermissions();
  const canPost = hasPermission(Permissions.INVOICE_POST);

  const [creditNote, setCreditNote] = useState<CreditNoteRecord | null>(null);
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<unknown>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [applyError, setApplyError] = useState<unknown>(null);
  const [applying, setApplying] = useState(false);

  const applyForm = useForm<CreditNoteApplyInput>({
    defaultValues: {
      allocations: [{ invoiceId: "", amount: 0 }],
    },
  });

  const {
    fields: allocationFields,
    append: appendAllocation,
    remove: removeAllocation,
    replace: replaceAllocations,
  } = useFieldArray({
    control: applyForm.control,
    name: "allocations",
  });

  const loadCreditNote = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, record] = await Promise.all([
        apiFetch<OrgSettingsResponse>("/orgs/current"),
        apiFetch<CreditNoteRecord>(`/credit-notes/${creditNoteId}`),
      ]);
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setCreditNote(record);
    } catch (err) {
      setActionError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to load credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setLoading(false);
    }
  }, [creditNoteId]);

  useEffect(() => {
    if (!creditNoteId) {
      return;
    }
    loadCreditNote();
  }, [creditNoteId, loadCreditNote]);

  useEffect(() => {
    if (!creditNote) {
      return;
    }
    const nextAllocations =
      creditNote.allocations?.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        amount: Number(allocation.amount ?? 0),
      })) ?? [];
    replaceAllocations(nextAllocations.length > 0 ? nextAllocations : [{ invoiceId: "", amount: 0 }]);
  }, [creditNote, replaceAllocations]);

  useEffect(() => {
    if (!creditNote?.customerId) {
      setInvoices([]);
      return;
    }
    let active = true;
    const loadInvoices = async () => {
      try {
        setApplyError(null);
        const result = await apiFetch<PaginatedResponse<InvoiceRecord>>(
          `/invoices?customerId=${creditNote.customerId}&status=POSTED`,
        );
        if (!active) {
          return;
        }
        const allocatedInvoices =
          creditNote.allocations
            ?.map((allocation) => allocation.invoice)
            .filter((invoice): invoice is InvoiceRecord => Boolean(invoice)) ?? [];
        const merged = mergeInvoices(result.data, allocatedInvoices);
        const filtered = creditNote.invoiceId ? merged.filter((invoice) => invoice.id === creditNote.invoiceId) : merged;
        setInvoices(filtered);
      } catch (err) {
        if (active) {
          setApplyError(err);
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [creditNote?.allocations, creditNote?.customerId, creditNote?.invoiceId]);

  const handlePost = async () => {
    if (!creditNote) {
      return;
    }
    setPosting(true);
    try {
      setPostError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setPostDialogOpen(false);
      toast({ title: "Credit note posted", description: "Ledger entries were created." });
    } catch (err) {
      setPostError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to post credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!creditNote) {
      return;
    }
    setVoiding(true);
    try {
      setVoidError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setVoidDialogOpen(false);
      toast({ title: "Credit note voided", description: "A reversal entry has been created." });
    } catch (err) {
      setVoidError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to void credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setVoiding(false);
    }
  };

  const allocationValues = applyForm.watch("allocations");
  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const selectedInvoiceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const allocation of allocationValues ?? []) {
      if (allocation.invoiceId) {
        ids.add(allocation.invoiceId);
      }
    }
    return ids;
  }, [allocationValues]);
  const availableInvoices = useMemo(() => {
    const list = invoices.filter((invoice) => {
      const outstanding = computeOutstanding(invoice);
      return outstanding > 0n || selectedInvoiceIds.has(invoice.id);
    });
    if (creditNote?.invoiceId) {
      return list.filter((invoice) => invoice.id === creditNote.invoiceId);
    }
    return list;
  }, [creditNote?.invoiceId, invoices, selectedInvoiceIds]);
  const creditTotalCents = toCents(creditNote?.total ?? 0);
  const appliedTotalCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => sum + toCents(allocation.amount ?? 0), 0n);
  }, [allocationValues]);
  const remainingCreditCents = creditTotalCents - appliedTotalCents;
  const currencyValue = creditNote?.currency ?? "AED";
  const allocationHint = !creditNote?.customerId
    ? "Select a customer to load invoices."
    : availableInvoices.length === 0
      ? "No posted invoices to apply for this customer."
      : null;
  const existingAllocationsByInvoice = useMemo(() => {
    return new Map((creditNote?.allocations ?? []).map((allocation) => [allocation.invoiceId, allocation]));
  }, [creditNote?.allocations]);

  const updateAllocationInvoice = (index: number, invoiceId: string) => {
    applyForm.setValue(`allocations.${index}.invoiceId`, invoiceId);
    const invoice = invoiceMap.get(invoiceId);
    if (!invoice) {
      return;
    }
    const currentAmount = toCents(applyForm.getValues(`allocations.${index}.amount`) ?? 0);
    if (currentAmount !== 0n) {
      return;
    }
    const outstanding = computeOutstanding(invoice);
    if (outstanding <= 0n) {
      return;
    }
    const otherAllocations = (applyForm.getValues("allocations") ?? []).reduce((sum, allocation, idx) => {
      if (idx === index) {
        return sum;
      }
      return sum + toCents(allocation.amount ?? 0);
    }, 0n);
    const remaining = creditTotalCents - otherAllocations;
    const nextAmount = remaining > 0n ? (remaining < outstanding ? remaining : outstanding) : 0n;
    if (nextAmount > 0n) {
      applyForm.setValue(`allocations.${index}.amount`, Number(formatBigIntDecimal(nextAmount, 2)));
    }
  };

  const handleAutoApply = () => {
    if (!creditNote || creditNote.status !== "POSTED") {
      return;
    }
    let remaining = creditTotalCents;
    const allocations: CreditNoteApplyInput["allocations"] = [];
    const sorted = [...availableInvoices].sort(
      (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
    );
    for (const invoice of sorted) {
      if (remaining <= 0n) {
        break;
      }
      const outstanding = computeOutstanding(invoice);
      if (outstanding <= 0n) {
        continue;
      }
      const amount = remaining < outstanding ? remaining : outstanding;
      allocations.push({
        invoiceId: invoice.id,
        amount: Number(formatBigIntDecimal(amount, 2)),
      });
      remaining -= amount;
    }
    replaceAllocations(allocations.length > 0 ? allocations : [{ invoiceId: "", amount: 0 }]);
  };

  const handleApply = async () => {
    if (!creditNote) {
      return;
    }
    const rawAllocations = applyForm.getValues("allocations") ?? [];
    const allocations = rawAllocations
      .filter((allocation) => allocation.invoiceId && Number(allocation.amount ?? 0) > 0)
      .map((allocation) => ({
        invoiceId: allocation.invoiceId,
        amount: Number(allocation.amount ?? 0),
      }));
    if (allocations.length === 0) {
      setApplyError("Add at least one allocation before applying.");
      return;
    }

    let total = 0n;
    for (const allocation of allocations) {
      const invoice = invoiceMap.get(allocation.invoiceId);
      if (!invoice) {
        setApplyError("One or more invoices are invalid.");
        return;
      }
      const outstanding = computeOutstanding(invoice);
      const amountCents = toCents(allocation.amount);
      total += amountCents;
      if (amountCents > outstanding) {
        setApplyError(`Allocation exceeds outstanding for invoice ${invoice.number ?? "Invoice"}.`);
        return;
      }
    }
    if (total > creditTotalCents) {
      setApplyError("Applied amount exceeds credit note total.");
      return;
    }

    setApplying(true);
    setApplyError(null);
    try {
      await apiFetch(`/credit-notes/${creditNote.id}/apply`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ allocations }),
      });
      await loadCreditNote();
      toast({ title: "Allocations applied", description: "Invoice balances were updated." });
    } catch (err) {
      setApplyError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to apply credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setApplying(false);
    }
  };

  const handleUnapply = async (invoiceId?: string) => {
    if (!creditNote) {
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      await apiFetch(`/credit-notes/${creditNote.id}/unapply`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(invoiceId ? { invoiceId } : {}),
      });
      await loadCreditNote();
      toast({ title: "Allocation removed", description: "Invoice balances were updated." });
    } catch (err) {
      setApplyError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to remove allocation",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRemoveAllocation = async (index: number, invoiceId: string) => {
    if (existingAllocationsByInvoice.has(invoiceId)) {
      await handleUnapply(invoiceId);
      return;
    }
    removeAllocation(index);
  };

  const lineRows = useMemo(() => creditNote?.lines ?? [], [creditNote?.lines]);

  if (loading) {
    return <div className="card">Loading credit note...</div>;
  }

  if (!creditNote) {
    const fallbackMessage = actionError ? normalizeError(actionError).message : "Credit note not found.";
    return (
      <div className="card">
        <PageHeader title="Credit Notes" heading="Credit Note" description={fallbackMessage} icon={<FileText className="h-5 w-5" />} />
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>Back to Credit Notes</Button>
      </div>
    );
  }

  const isPosted = creditNote.status === "POSTED";
  const isDraft = creditNote.status === "DRAFT";
  const canApply = isPosted && canPost;
  const creditNoteDate = creditNote.creditNoteDate ? new Date(creditNote.creditNoteDate) : null;
  const isLocked = isDateLocked(lockDate, creditNoteDate ?? undefined);
  const lastSavedAt = creditNote.updatedAt ? formatDateTime(creditNote.updatedAt) : null;
  const postedAt = creditNote.postedAt ? formatDateTime(creditNote.postedAt) : null;
  const voidedAt = creditNote.voidedAt ? formatDateTime(creditNote.voidedAt) : null;

  return (
    <div className="card">
      <PageHeader
        title="Credit Notes"
        heading={creditNote.number ?? "Credit Note"}
        description={`${creditNote.customer?.name ?? "Customer"} | ${creditNote.currency}`}
        icon={<FileText className="h-5 w-5" />}
        meta={
          <>
            {lastSavedAt ? <p className="muted">Last saved at {lastSavedAt}</p> : null}
            {postedAt ? <p className="muted">Posted at {postedAt}</p> : null}
            {voidedAt ? <p className="muted">Voided at {voidedAt}</p> : null}
          </>
        }
        actions={<StatusChip status={creditNote.status} />}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={() => loadCreditNote()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="posting and voiding" />

      <div className="form-grid">
        <div>
          <p className="muted">Credit Note Date</p>
          <p>{formatDate(creditNote.creditNoteDate)}</p>
        </div>
        <div>
          <p className="muted">Customer</p>
          <p>{creditNote.customer?.name ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Reference</p>
          <p>{creditNote.reference ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Subtotal</p>
          <p>{formatMoney(creditNote.subTotal, creditNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Tax</p>
          <p>{formatMoney(creditNote.taxTotal, creditNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Total</p>
          <p>{formatMoney(creditNote.total, creditNote.currency)}</p>
        </div>
      </div>

      {creditNote.notes ? (
        <>
          <div style={{ height: 12 }} />
          <p className="muted">Notes</p>
          <p>{creditNote.notes}</p>
        </>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <h2>Line items</h2>
      </div>
      {lineRows.length === 0 ? <p className="muted">No line items found.</p> : null}
      {lineRows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineRows.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.item?.name ?? "-"}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell>{line.qty}</TableCell>
                <TableCell>{formatMoney(line.unitPrice, creditNote.currency)}</TableCell>
                <TableCell>{formatMoney(line.discountAmount ?? 0, creditNote.currency)}</TableCell>
                <TableCell>
                  {line.taxCode?.name
                    ? `${line.taxCode.name} (${formatMoney(line.lineTax ?? 0, creditNote.currency)})`
                    : formatMoney(line.lineTax ?? 0, creditNote.currency)}
                </TableCell>
                <TableCell>{formatMoney(line.lineTotal ?? 0, creditNote.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <div>
          <h2>Apply to invoices</h2>
          <p className={remainingCreditCents < 0n ? "form-error" : "muted"}>
            Remaining credit: {formatCents(remainingCreditCents < 0n ? -remainingCreditCents : remainingCreditCents, currencyValue)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {canApply ? (
            <Button type="button" variant="secondary" onClick={handleAutoApply} disabled={availableInvoices.length === 0}>
              Apply remaining
            </Button>
          ) : null}
          {canApply && (creditNote.allocations?.length ?? 0) > 0 ? (
            <Button type="button" variant="ghost" onClick={() => handleUnapply()}>
              Unapply all
            </Button>
          ) : null}
          <strong>Total applied: {formatCents(appliedTotalCents, currencyValue)}</strong>
        </div>
      </div>
      {!isPosted ? <p className="muted">Post this sales return before applying allocations.</p> : null}
      {applyError ? <ErrorBanner error={applyError} /> : null}
      {allocationHint ? <p className="muted">{allocationHint}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Outstanding</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocationFields.map((field, index) => {
            const invoiceId = applyForm.getValues(`allocations.${index}.invoiceId`);
            const selectedInvoice = invoiceMap.get(invoiceId);
            const outstanding = selectedInvoice ? computeOutstanding(selectedInvoice) : 0n;
            const allocationCents = toCents(applyForm.getValues(`allocations.${index}.amount`) ?? 0);
            const overAllocated = selectedInvoice ? allocationCents > outstanding : false;
            const overBy = overAllocated ? allocationCents - outstanding : 0n;

            return (
              <TableRow key={field.id}>
                <TableCell>
                  <Controller
                    control={applyForm.control}
                    name={`allocations.${index}.invoiceId`}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(value) => {
                          field.onChange(value);
                          updateAllocationInvoice(index, value);
                        }}
                        disabled={!canApply || availableInvoices.length === 0}
                      >
                        <SelectTrigger aria-label="Invoice">
                          <SelectValue placeholder="Select invoice" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableInvoices.map((invoice) => (
                            <SelectItem key={invoice.id} value={invoice.id}>
                              {invoice.number ?? "Invoice"} • {formatMoney(invoice.total, invoice.currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </TableCell>
                <TableCell>
                  {selectedInvoice ? formatCents(outstanding, currencyValue) : "-"}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canApply}
                    {...applyForm.register(`allocations.${index}.amount`)}
                  />
                  {overAllocated ? (
                    <p className="form-error">Over by {formatCents(overBy, currencyValue)}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {canApply ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAllocation(index, invoiceId)}
                      disabled={applying}
                    >
                      Remove
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {canApply ? (
        <>
          <div style={{ height: 12 }} />
          <div className="form-action-bar">
            <Button
              type="button"
              variant="secondary"
              onClick={() => appendAllocation({ invoiceId: "", amount: 0 })}
              disabled={applying}
            >
              Add allocation
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={applying || remainingCreditCents < 0n || creditTotalCents <= 0n}
            >
              {applying ? "Applying..." : "Apply allocations"}
            </Button>
          </div>
        </>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="form-action-bar">
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>Back to Credit Notes</Button>
        {isDraft && canPost ? (
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLocked}>Post Credit Note</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post credit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="posting" />
              <PostImpactSummary mode="post" />
              {postError ? <ErrorBanner error={postError} /> : null}
              <div style={{ height: 12 }} />
              <Button type="button" onClick={handlePost} disabled={posting || isLocked}>
                {posting ? "Posting..." : "Confirm Post"}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
        {isPosted && canPost ? (
          <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isLocked || voiding}>
                Void Credit Note
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void credit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="voiding" />
              <PostImpactSummary mode="void" />
              {voidError ? <ErrorBanner error={voidError} /> : null}
              <div style={{ height: 12 }} />
              <Button type="button" variant="destructive" onClick={handleVoid} disabled={voiding || isLocked}>
                {voiding ? "Voiding..." : "Confirm Void"}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

function mergeInvoices(existing: InvoiceRecord[], incoming: InvoiceRecord[]) {
  const map = new Map(existing.map((invoice) => [invoice.id, invoice]));
  for (const invoice of incoming) {
    if (!invoice) {
      continue;
    }
    map.set(invoice.id, invoice);
  }
  return Array.from(map.values());
}
