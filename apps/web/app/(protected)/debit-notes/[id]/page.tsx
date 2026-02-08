"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Permissions, type DebitNoteApplyInput, type PaginatedResponse } from "@ledgerlite/shared";
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

type DebitNoteLineRecord = {
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

type BillRecord = {
  id: string;
  systemNumber?: string | null;
  billNumber?: string | null;
  billDate: string;
  dueDate?: string | null;
  currency: string;
  total: string | number;
  amountPaid?: string | number | null;
};

type AllocationRecord = {
  id: string;
  billId: string;
  amount: string | number;
  bill: BillRecord;
};

type DebitNoteRecord = {
  id: string;
  number?: string | null;
  status: string;
  vendorId: string;
  billId?: string | null;
  debitNoteDate: string;
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
  vendor?: { id: string; name: string } | null;
  lines: DebitNoteLineRecord[];
  allocations?: AllocationRecord[];
};

type OrgSettingsResponse = {
  baseCurrency?: string;
  orgSettings?: { lockDate?: string | null };
};

const computeOutstanding = (bill: BillRecord) => {
  const totalCents = toCents(bill.total ?? 0);
  const paidCents = toCents(bill.amountPaid ?? 0);
  const remaining = totalCents - paidCents;
  return remaining > 0n ? remaining : 0n;
};

const formatCents = (value: bigint, currency: string) => formatMoney(formatBigIntDecimal(value, 2), currency);

export default function DebitNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const debitNoteId = params?.id ?? "";
  const { hasPermission } = usePermissions();
  const canPost = hasPermission(Permissions.BILL_POST);

  const [debitNote, setDebitNote] = useState<DebitNoteRecord | null>(null);
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<unknown>(null);
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [applyError, setApplyError] = useState<unknown>(null);
  const [applying, setApplying] = useState(false);

  const applyForm = useForm<DebitNoteApplyInput>({
    defaultValues: {
      allocations: [{ billId: "", amount: 0 }],
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

  const loadDebitNote = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, record] = await Promise.all([
        apiFetch<OrgSettingsResponse>("/orgs/current"),
        apiFetch<DebitNoteRecord>(`/debit-notes/${debitNoteId}`),
      ]);
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setDebitNote(record);
    } catch (err) {
      setActionError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to load debit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setLoading(false);
    }
  }, [debitNoteId]);

  useEffect(() => {
    if (!debitNoteId) {
      return;
    }
    loadDebitNote();
  }, [debitNoteId, loadDebitNote]);

  useEffect(() => {
    if (!debitNote) {
      return;
    }
    const nextAllocations =
      debitNote.allocations?.map((allocation) => ({
        billId: allocation.billId,
        amount: Number(allocation.amount ?? 0),
      })) ?? [];
    replaceAllocations(nextAllocations.length > 0 ? nextAllocations : [{ billId: "", amount: 0 }]);
  }, [debitNote, replaceAllocations]);

  useEffect(() => {
    if (!debitNote?.vendorId) {
      setBills([]);
      return;
    }
    let active = true;
    const loadBills = async () => {
      try {
        setApplyError(null);
        const result = await apiFetch<PaginatedResponse<BillRecord>>(
          `/bills?vendorId=${debitNote.vendorId}&status=POSTED`,
        );
        if (!active) {
          return;
        }
        const allocatedBills =
          debitNote.allocations
            ?.map((allocation) => allocation.bill)
            .filter((bill): bill is BillRecord => Boolean(bill)) ?? [];
        const merged = mergeBills(result.data, allocatedBills);
        const filtered = debitNote.billId ? merged.filter((bill) => bill.id === debitNote.billId) : merged;
        setBills(filtered);
      } catch (err) {
        if (active) {
          setApplyError(err);
        }
      }
    };

    loadBills();

    return () => {
      active = false;
    };
  }, [debitNote?.allocations, debitNote?.vendorId, debitNote?.billId]);

  const handlePost = async () => {
    if (!debitNote) {
      return;
    }
    setPosting(true);
    try {
      setPostError(null);
      const updated = await apiFetch<DebitNoteRecord>(`/debit-notes/${debitNote.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setDebitNote(updated);
      setPostDialogOpen(false);
      toast({ title: "Debit note posted", description: "Ledger entries were created." });
    } catch (err) {
      setPostError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to post debit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!debitNote) {
      return;
    }
    setVoiding(true);
    try {
      setVoidError(null);
      const updated = await apiFetch<DebitNoteRecord>(`/debit-notes/${debitNote.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setDebitNote(updated);
      setVoidDialogOpen(false);
      toast({ title: "Debit note voided", description: "A reversal entry has been created." });
    } catch (err) {
      setVoidError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to void debit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setVoiding(false);
    }
  };

  const allocationValues = applyForm.watch("allocations");
  const billMap = useMemo(() => new Map(bills.map((bill) => [bill.id, bill])), [bills]);
  const selectedBillIds = useMemo(() => {
    const ids = new Set<string>();
    for (const allocation of allocationValues ?? []) {
      if (allocation.billId) {
        ids.add(allocation.billId);
      }
    }
    return ids;
  }, [allocationValues]);
  const availableBills = useMemo(() => {
    const list = bills.filter((bill) => {
      const outstanding = computeOutstanding(bill);
      return outstanding > 0n || selectedBillIds.has(bill.id);
    });
    if (debitNote?.billId) {
      return list.filter((bill) => bill.id === debitNote.billId);
    }
    return list;
  }, [debitNote?.billId, bills, selectedBillIds]);
  const creditTotalCents = toCents(debitNote?.total ?? 0);
  const appliedTotalCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => sum + toCents(allocation.amount ?? 0), 0n);
  }, [allocationValues]);
  const remainingCreditCents = creditTotalCents - appliedTotalCents;
  const currencyValue = debitNote?.currency ?? "AED";
  const allocationHint = !debitNote?.vendorId
    ? "Select a vendor to load bills."
    : availableBills.length === 0
      ? "No posted bills to apply for this vendor."
      : null;
  const existingAllocationsByBill = useMemo(() => {
    return new Map((debitNote?.allocations ?? []).map((allocation) => [allocation.billId, allocation]));
  }, [debitNote?.allocations]);

  const updateAllocationBill = (index: number, billId: string) => {
    applyForm.setValue(`allocations.${index}.billId`, billId);
    const bill = billMap.get(billId);
    if (!bill) {
      return;
    }
    const currentAmount = toCents(applyForm.getValues(`allocations.${index}.amount`) ?? 0);
    if (currentAmount !== 0n) {
      return;
    }
    const outstanding = computeOutstanding(bill);
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
    if (!debitNote || debitNote.status !== "POSTED") {
      return;
    }
    let remaining = creditTotalCents;
    const allocations: DebitNoteApplyInput["allocations"] = [];
    const sorted = [...availableBills].sort(
      (a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime(),
    );
    for (const bill of sorted) {
      if (remaining <= 0n) {
        break;
      }
      const outstanding = computeOutstanding(bill);
      if (outstanding <= 0n) {
        continue;
      }
      const amount = remaining < outstanding ? remaining : outstanding;
      allocations.push({
        billId: bill.id,
        amount: Number(formatBigIntDecimal(amount, 2)),
      });
      remaining -= amount;
    }
    replaceAllocations(allocations.length > 0 ? allocations : [{ billId: "", amount: 0 }]);
  };

  const handleApply = async () => {
    if (!debitNote) {
      return;
    }
    const rawAllocations = applyForm.getValues("allocations") ?? [];
    const allocations = rawAllocations
      .filter((allocation) => allocation.billId && Number(allocation.amount ?? 0) > 0)
      .map((allocation) => ({
        billId: allocation.billId,
        amount: Number(allocation.amount ?? 0),
      }));
    if (allocations.length === 0) {
      setApplyError("Add at least one allocation before applying.");
      return;
    }

    let total = 0n;
    for (const allocation of allocations) {
      const bill = billMap.get(allocation.billId);
      if (!bill) {
        setApplyError("One or more bills are invalid.");
        return;
      }
      const outstanding = computeOutstanding(bill);
      const amountCents = toCents(allocation.amount);
      total += amountCents;
      if (amountCents > outstanding) {
        const billLabel = bill.systemNumber ?? bill.billNumber ?? "Bill";
        setApplyError(`Allocation exceeds outstanding for bill ${billLabel}.`);
        return;
      }
    }
    if (total > creditTotalCents) {
      setApplyError("Applied amount exceeds debit note total.");
      return;
    }

    setApplying(true);
    setApplyError(null);
    try {
      await apiFetch(`/debit-notes/${debitNote.id}/apply`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ allocations }),
      });
      await loadDebitNote();
      toast({ title: "Allocations applied", description: "Bill balances were updated." });
    } catch (err) {
      setApplyError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to apply debit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setApplying(false);
    }
  };

  const handleUnapply = async (billId?: string) => {
    if (!debitNote) {
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      await apiFetch(`/debit-notes/${debitNote.id}/unapply`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(billId ? { billId } : {}),
      });
      await loadDebitNote();
      toast({ title: "Allocation removed", description: "Bill balances were updated." });
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

  const handleRemoveAllocation = async (index: number, billId: string) => {
    if (existingAllocationsByBill.has(billId)) {
      await handleUnapply(billId);
      return;
    }
    removeAllocation(index);
  };

  const lineRows = useMemo(() => debitNote?.lines ?? [], [debitNote?.lines]);

  if (loading) {
    return <div className="card">Loading debit note...</div>;
  }

  if (!debitNote) {
    const fallbackMessage = actionError ? normalizeError(actionError).message : "Debit note not found.";
    return (
      <div className="card">
        <PageHeader title="Debit Notes" heading="Debit Note" description={fallbackMessage} icon={<FileText className="h-5 w-5" />} />
        <Button variant="secondary" onClick={() => router.push("/debit-notes")}>Back to Debit Notes</Button>
      </div>
    );
  }

  const isPosted = debitNote.status === "POSTED";
  const isDraft = debitNote.status === "DRAFT";
  const canApply = isPosted && canPost;
  const debitNoteDate = debitNote.debitNoteDate ? new Date(debitNote.debitNoteDate) : null;
  const isLocked = isDateLocked(lockDate, debitNoteDate ?? undefined);
  const lastSavedAt = debitNote.updatedAt ? formatDateTime(debitNote.updatedAt) : null;
  const postedAt = debitNote.postedAt ? formatDateTime(debitNote.postedAt) : null;
  const voidedAt = debitNote.voidedAt ? formatDateTime(debitNote.voidedAt) : null;

  return (
    <div className="card">
      <PageHeader
        title="Debit Notes"
        heading={debitNote.number ?? "Debit Note"}
        description={`${debitNote.vendor?.name ?? "Vendor"} | ${debitNote.currency}`}
        icon={<FileText className="h-5 w-5" />}
        meta={
          <>
            {lastSavedAt ? <p className="muted">Last saved at {lastSavedAt}</p> : null}
            {postedAt ? <p className="muted">Posted at {postedAt}</p> : null}
            {voidedAt ? <p className="muted">Voided at {voidedAt}</p> : null}
          </>
        }
        actions={<StatusChip status={debitNote.status} />}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={() => loadDebitNote()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={debitNoteDate ?? undefined} actionLabel="posting and voiding" />

      <div className="form-grid">
        <div>
          <p className="muted">Debit Note Date</p>
          <p>{formatDate(debitNote.debitNoteDate)}</p>
        </div>
        <div>
          <p className="muted">Vendor</p>
          <p>{debitNote.vendor?.name ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Reference</p>
          <p>{debitNote.reference ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Subtotal</p>
          <p>{formatMoney(debitNote.subTotal, debitNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Tax</p>
          <p>{formatMoney(debitNote.taxTotal, debitNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Total</p>
          <p>{formatMoney(debitNote.total, debitNote.currency)}</p>
        </div>
      </div>

      {debitNote.notes ? (
        <>
          <div style={{ height: 12 }} />
          <p className="muted">Notes</p>
          <p>{debitNote.notes}</p>
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
                <TableCell>{formatMoney(line.unitPrice, debitNote.currency)}</TableCell>
                <TableCell>{formatMoney(line.discountAmount ?? 0, debitNote.currency)}</TableCell>
                <TableCell>
                  {line.taxCode?.name
                    ? `${line.taxCode.name} (${formatMoney(line.lineTax ?? 0, debitNote.currency)})`
                    : formatMoney(line.lineTax ?? 0, debitNote.currency)}
                </TableCell>
                <TableCell>{formatMoney(line.lineTotal ?? 0, debitNote.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <div>
          <h2>Apply to bills</h2>
          <p className={remainingCreditCents < 0n ? "form-error" : "muted"}>
            Remaining credit: {formatCents(remainingCreditCents < 0n ? -remainingCreditCents : remainingCreditCents, currencyValue)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {canApply ? (
            <Button type="button" variant="secondary" onClick={handleAutoApply} disabled={availableBills.length === 0}>
              Apply remaining
            </Button>
          ) : null}
          {canApply && (debitNote.allocations?.length ?? 0) > 0 ? (
            <Button type="button" variant="ghost" onClick={() => handleUnapply()}>
              Unapply all
            </Button>
          ) : null}
          <strong>Total applied: {formatCents(appliedTotalCents, currencyValue)}</strong>
        </div>
      </div>
      {!isPosted ? <p className="muted">Post this purchase return before applying allocations.</p> : null}
      {applyError ? <ErrorBanner error={applyError} /> : null}
      {allocationHint ? <p className="muted">{allocationHint}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bill</TableHead>
            <TableHead>Outstanding</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocationFields.map((field, index) => {
            const billId = applyForm.getValues(`allocations.${index}.billId`);
            const selectedBill = billMap.get(billId);
            const outstanding = selectedBill ? computeOutstanding(selectedBill) : 0n;
            const allocationCents = toCents(applyForm.getValues(`allocations.${index}.amount`) ?? 0);
            const overAllocated = selectedBill ? allocationCents > outstanding : false;
            const overBy = overAllocated ? allocationCents - outstanding : 0n;

            return (
              <TableRow key={field.id}>
                <TableCell>
                  <Controller
                    control={applyForm.control}
                    name={`allocations.${index}.billId`}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(value) => {
                          field.onChange(value);
                          updateAllocationBill(index, value);
                        }}
                        disabled={!canApply || availableBills.length === 0}
                      >
                        <SelectTrigger aria-label="Bill">
                          <SelectValue placeholder="Select bill" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBills.map((bill) => (
                            <SelectItem key={bill.id} value={bill.id}>
                              {bill.systemNumber ?? bill.billNumber ?? "Bill"} • {formatMoney(bill.total, bill.currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </TableCell>
                <TableCell>
                  {selectedBill ? formatCents(outstanding, currencyValue) : "-"}
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
                      onClick={() => handleRemoveAllocation(index, billId)}
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
              onClick={() => appendAllocation({ billId: "", amount: 0 })}
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
        <Button variant="secondary" onClick={() => router.push("/debit-notes")}>Back to Debit Notes</Button>
        {isDraft && canPost ? (
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLocked}>Post Debit Note</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post debit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={debitNoteDate ?? undefined} actionLabel="posting" />
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
                Void Debit Note
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void debit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={debitNoteDate ?? undefined} actionLabel="voiding" />
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

function mergeBills(existing: BillRecord[], incoming: BillRecord[]) {
  const map = new Map(existing.map((bill) => [bill.id, bill]));
  for (const bill of incoming) {
    if (!bill) {
      continue;
    }
    map.set(bill.id, bill);
  }
  return Array.from(map.values());
}
