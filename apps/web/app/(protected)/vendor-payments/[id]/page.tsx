"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  vendorPaymentCreateSchema,
  Permissions,
  type VendorPaymentAllocationInput,
  type VendorPaymentCreateInput,
  type PaginatedResponse,
} from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDateTime, formatMoney } from "../../../../src/lib/format";
import { formatBigIntDecimal, toCents } from "../../../../src/lib/money";
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

type VendorRecord = { id: string; name: string; isActive: boolean };

type BankAccountRecord = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
};

type BillRecord = {
  id: string;
  systemNumber?: string | null;
  billNumber?: string | null;
  status: string;
  vendorId: string;
  billDate: string;
  dueDate: string;
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

type VendorPaymentRecord = {
  id: string;
  number?: string | null;
  status: string;
  vendorId: string;
  bankAccountId?: string | null;
  paymentDate: string;
  currency: string;
  exchangeRate?: string | number | null;
  amountTotal: string | number;
  reference?: string | null;
  memo?: string | null;
  updatedAt?: string;
  postedAt?: string | null;
  allocations: AllocationRecord[];
  vendor: { id: string; name: string };
  bankAccount?: BankAccountRecord | null;
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

const resolveBillNumber = (bill: BillRecord) => bill.systemNumber ?? bill.billNumber ?? "Draft";

const computeOutstanding = (bill: BillRecord) => {
  const totalCents = toCents(bill.total ?? 0);
  const paidCents = toCents(bill.amountPaid ?? 0);
  const remaining = totalCents - paidCents;
  return remaining > 0n ? remaining : 0n;
};

export default function VendorPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const paymentId = params?.id ?? "";
  const isNew = paymentId === "new";

  const [payment, setPayment] = useState<VendorPaymentRecord | null>(null);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [bills, setBills] = useState<BillRecord[]>([]);
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
  const canWrite = hasPermission(Permissions.VENDOR_PAYMENT_WRITE);
  const canPost = hasPermission(Permissions.VENDOR_PAYMENT_POST);

  const form = useForm<VendorPaymentCreateInput>({
    resolver: zodResolver(vendorPaymentCreateSchema),
    defaultValues: {
      vendorId: "",
      bankAccountId: "",
      paymentDate: new Date(),
      currency: orgCurrency,
      exchangeRate: 1,
      allocations: [{ billId: "", amount: 0 }],
      reference: "",
      memo: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.isActive), [vendors]);
  const activeBankAccounts = useMemo(() => bankAccounts.filter((account) => account.isActive), [bankAccounts]);

  const billMap = useMemo(() => new Map(bills.map((bill) => [bill.id, bill])), [bills]);
  const allocationValues = form.watch("allocations");
  const selectedVendorId = form.watch("vendorId");
  const selectedBankAccountId = form.watch("bankAccountId");
  const paymentDateValue = form.watch("paymentDate");
  const currencyValue = form.watch("currency") || orgCurrency;
  const isLocked = isDateLocked(lockDate, paymentDateValue);
  const showMultiCurrencyWarning = currencyValue !== orgCurrency;

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
    return bills.filter((bill) => {
      const outstanding = computeOutstanding(bill);
      return outstanding > 0n || selectedBillIds.has(bill.id);
    });
  }, [bills, selectedBillIds]);

  const totalAmountCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => {
      return sum + toCents(allocation.amount ?? 0);
    }, 0n);
  }, [allocationValues]);

  const selectedOutstandingCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => {
      const bill = billMap.get(allocation.billId);
      if (!bill) {
        return sum;
      }
      return sum + computeOutstanding(bill);
    }, 0n);
  }, [allocationValues, billMap]);

  const remainingCents = selectedOutstandingCents - totalAmountCents;
  const formatCents = (value: bigint) => formatMoney(formatBigIntDecimal(value, 2), currencyValue);

  const isReadOnly = !canWrite || (!isNew && payment?.status !== "DRAFT");

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const [org, vendorData, bankData] = await Promise.all([
          apiFetch<{ baseCurrency?: string; orgSettings?: { lockDate?: string | null } }>("/orgs/current"),
          apiFetch<VendorRecord[]>("/vendors"),
          apiFetch<BankAccountRecord[]>("/bank-accounts").catch(() => []),
        ]);
        setOrgCurrency(org.baseCurrency ?? "AED");
        setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
        setVendors(vendorData);
        setBankAccounts(bankData);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load vendor payment references.");
      } finally {
        setLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  useEffect(() => {
    if (selectedBankAccountId) {
      const bankAccount = bankAccounts.find((account) => account.id === selectedBankAccountId);
      if (bankAccount?.currency) {
        form.setValue("currency", bankAccount.currency);
      }
    }
  }, [bankAccounts, form, selectedBankAccountId]);

  useEffect(() => {
    if (isNew) {
      form.reset({
        vendorId: "",
        bankAccountId: "",
        paymentDate: new Date(),
        currency: orgCurrency,
        exchangeRate: 1,
        allocations: [{ billId: "", amount: 0 }],
        reference: "",
        memo: "",
      });
      replace([{ billId: "", amount: 0 }]);
      return;
    }

    const loadPayment = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<VendorPaymentRecord>(`/vendor-payments/${paymentId}`);
        setPayment(data);
        const allocationDefaults = data.allocations.map((allocation) => ({
          billId: allocation.billId,
          amount: Number(allocation.amount),
        }));
        form.reset({
          vendorId: data.vendorId,
          bankAccountId: data.bankAccountId ?? "",
          paymentDate: new Date(data.paymentDate),
          currency: data.currency,
          exchangeRate: data.exchangeRate != null ? Number(data.exchangeRate) : 1,
          allocations: allocationDefaults,
          reference: data.reference ?? "",
          memo: data.memo ?? "",
        });
        replace(allocationDefaults);
        const allocatedBills = data.allocations.map((allocation) => allocation.bill);
        setBills((existing) => mergeBills(existing, allocatedBills));
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load vendor payment.");
      } finally {
        setLoading(false);
      }
    };

    loadPayment();
  }, [form, isNew, orgCurrency, paymentId, replace]);

  useEffect(() => {
    if (!selectedVendorId) {
      setBills([]);
      if (isNew) {
        replace([{ billId: "", amount: 0 }]);
      }
      return;
    }

    let active = true;
    const loadBills = async () => {
      try {
        const result = await apiFetch<PaginatedResponse<BillRecord>>(
          `/bills?vendorId=${selectedVendorId}&status=POSTED`,
        );
        if (!active) {
          return;
        }
        const allocatedBills = payment?.allocations.map((allocation) => allocation.bill) ?? [];
        setBills(mergeBills(result.data, allocatedBills));
        if (isNew) {
          replace([{ billId: "", amount: 0 }]);
        }
      } catch (err) {
        if (active) {
          setActionError(err instanceof Error ? err : "Unable to load bills.");
        }
      }
    };

    loadBills();

    return () => {
      active = false;
    };
  }, [isNew, payment?.allocations, replace, selectedVendorId]);

  const ledgerPreview = useMemo(() => {
    const bankAccount = bankAccounts.find((account) => account.id === selectedBankAccountId);
    if (!bankAccount || totalAmountCents <= 0n) {
      return [];
    }
    return [
      { label: "Accounts Payable", debitCents: totalAmountCents },
      { label: bankAccount.name, creditCents: totalAmountCents },
    ];
  }, [bankAccounts, selectedBankAccountId, totalAmountCents]);

  const submitPayment = async (values: VendorPaymentCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      const payload = {
        ...values,
        currency: values.currency ?? orgCurrency,
        allocations: values.allocations.map((allocation) => ({
          billId: allocation.billId,
          amount: Number(allocation.amount),
        })) as VendorPaymentAllocationInput[],
      };

      if (isNew) {
        const created = await apiFetch<VendorPaymentRecord>("/vendor-payments", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(payload),
        });
        toast({ title: "Vendor payment draft created", description: "Draft saved successfully." });
        router.replace(`/vendor-payments/${created.id}`);
        return;
      }

      const updated = await apiFetch<VendorPaymentRecord>(`/vendor-payments/${paymentId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setPayment(updated);
      toast({ title: "Vendor payment saved", description: "Draft updates saved." });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save vendor payment", err);
    } finally {
      setSaving(false);
    }
  };

  const postPayment = async () => {
    if (!payment || !canPost) {
      return;
    }
    setPostError(null);
    try {
      const result = await apiFetch<{ payment: VendorPaymentRecord }>(`/vendor-payments/${payment.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setPayment(result.payment);
      setPostDialogOpen(false);
      toast({ title: "Vendor payment posted", description: "Ledger entries created." });
    } catch (err) {
      setPostError(err);
      showErrorToast("Unable to post vendor payment", err);
    }
  };

  const voidPayment = async () => {
    if (!payment || !canPost) {
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      const result = await apiFetch<{ payment: VendorPaymentRecord }>(`/vendor-payments/${payment.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setPayment(result.payment);
      setVoidDialogOpen(false);
      toast({ title: "Vendor payment voided", description: "A reversal entry was created." });
    } catch (err) {
      setVoidError(err);
      showErrorToast("Unable to void vendor payment", err);
    } finally {
      setVoiding(false);
    }
  };

  const updateAllocationBill = (index: number, billId: string) => {
    form.setValue(`allocations.${index}.billId`, billId);
    const bill = billMap.get(billId);
    if (!bill) {
      return;
    }
    const outstanding = computeOutstanding(bill);
    const currentAmount = Number(form.getValues(`allocations.${index}.amount`) ?? 0);
    if (currentAmount === 0 && outstanding > 0) {
      form.setValue(`allocations.${index}.amount`, Number(formatBigIntDecimal(outstanding, 2)));
    }
  };

  if (loading) {
    return <div className="card">Loading vendor payment...</div>;
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <h1>Vendor Payments</h1>
        <p className="muted">You do not have permission to record vendor payments.</p>
        <Button variant="secondary" onClick={() => router.push("/vendor-payments")}>
          Back to vendor payments
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && payment?.updatedAt ? formatDateTime(payment.updatedAt) : null;
  const postedAt = !isNew && payment?.postedAt ? formatDateTime(payment.postedAt) : null;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "Pay Vendor" : payment?.number ?? "Draft Payment"}</h1>
          <p className="muted">
            {isNew
              ? "Record a vendor payment allocation."
              : `${payment?.vendor?.name ?? "Vendor"} | ${payment?.currency ?? orgCurrency}`}
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
          <StatusChip status={payment?.status ?? "DRAFT"} />
        ) : null}
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={() => window.location.reload()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={paymentDateValue} actionLabel="saving or posting" />
      {showMultiCurrencyWarning ? (
        <p className="form-error">Multi-currency is not fully supported yet. Review exchange rates before posting.</p>
      ) : null}

      <form onSubmit={form.handleSubmit(submitPayment)}>
        <div className="form-grid">
          <label>
            Vendor *
            <Controller
              control={form.control}
              name="vendorId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isReadOnly}>
                  <SelectTrigger aria-label="Vendor">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {renderFieldError(form.formState.errors.vendorId?.message)}
          </label>
          <label>
            Bank Account *
            <Controller
              control={form.control}
              name="bankAccountId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isReadOnly}>
                  <SelectTrigger aria-label="Bank account">
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeBankAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {renderFieldError(form.formState.errors.bankAccountId?.message)}
          </label>
          <label>
            Payment Date *
            <Controller
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                />
              )}
            />
            {renderFieldError(form.formState.errors.paymentDate?.message)}
          </label>
          <label>
            Currency *
            <Input disabled={isReadOnly} {...form.register("currency")} />
            {renderFieldError(form.formState.errors.currency?.message)}
          </label>
          <label>
            Reference
            <Input disabled={isReadOnly} {...form.register("reference")} />
          </label>
          <label>
            Memo
            <Input disabled={isReadOnly} {...form.register("memo")} />
          </label>
        </div>

        <div style={{ height: 16 }} />
        <div className="section-header">
          <div>
            <strong>Allocations</strong>
            <p className={remainingCents < 0n ? "form-error" : "muted"}>
              Remaining to allocate: {formatCents(remainingCents < 0n ? -remainingCents : remainingCents)}
            </p>
          </div>
          <div>
            <strong>Total: {formatCents(totalAmountCents)}</strong>
          </div>
        </div>
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
            {fields.map((field, index) => {
              const selectedBill = billMap.get(form.getValues(`allocations.${index}.billId`));
              const outstanding = selectedBill ? computeOutstanding(selectedBill) : 0n;
              const allocationCents = toCents(form.getValues(`allocations.${index}.amount`) ?? 0);
              const overAllocated = selectedBill ? allocationCents > outstanding : false;
              const overAllocatedBy = overAllocated ? allocationCents - outstanding : 0n;

              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <Controller
                      control={form.control}
                      name={`allocations.${index}.billId`}
                      render={({ field }) => (
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(value) => {
                            field.onChange(value);
                            updateAllocationBill(index, value);
                          }}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger aria-label="Bill">
                            <SelectValue placeholder="Select bill" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableBills.map((bill) => (
                              <SelectItem key={bill.id} value={bill.id}>
                                {resolveBillNumber(bill)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(form.formState.errors.allocations?.[index]?.billId?.message)}
                  </TableCell>
                  <TableCell>{selectedBill ? formatMoney(formatBigIntDecimal(outstanding, 2), selectedBill.currency) : "-"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isReadOnly}
                      {...form.register(`allocations.${index}.amount`, { valueAsNumber: true })}
                      className={overAllocated ? "border-destructive focus-visible:ring-destructive" : undefined}
                    />
                    {overAllocated && selectedBill ? (
                      <p className="form-error">
                        Exceeds outstanding by {formatMoney(formatBigIntDecimal(overAllocatedBy, 2), selectedBill.currency)}
                      </p>
                    ) : null}
                    {renderFieldError(form.formState.errors.allocations?.[index]?.amount?.message)}
                  </TableCell>
                  <TableCell>
                    {!isReadOnly ? (
                      <Button type="button" variant="ghost" onClick={() => remove(index)}>
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
          <Button type="button" variant="secondary" onClick={() => append({ billId: "", amount: 0 })}>
            Add Allocation
          </Button>
        ) : null}

        <div style={{ height: 16 }} />
        {!isReadOnly ? (
          <Button type="submit" disabled={saving || isLocked}>
            {saving ? "Saving..." : "Save Payment"}
          </Button>
        ) : null}
      </form>

      {!isNew && payment?.status === "DRAFT" && canPost ? (
        <div style={{ marginTop: 16 }}>
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLocked}>Post Payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post Vendor Payment</DialogTitle>
              </DialogHeader>
              <p>This action will post the payment and update the ledger.</p>
              <div style={{ marginTop: 12 }}>
                <strong>Ledger Impact</strong>
                {ledgerPreview.length === 0 ? (
                  <p className="muted">Select a bank account to preview entries.</p>
                ) : (
                  <ul>
                    {ledgerPreview.map((line) => (
                      <li key={line.label}>
                        {line.debitCents ? `Debit ${line.label} ${formatCents(line.debitCents)}` : null}
                        {line.creditCents ? `Credit ${line.label} ${formatCents(line.creditCents)}` : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {postError ? <ErrorBanner error={postError} /> : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setPostDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={postPayment} disabled={isLocked}>Post Payment</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
      {!isNew && payment?.status === "POSTED" && canPost ? (
        <div style={{ marginTop: 16 }}>
          <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isLocked || voiding}>
                Void Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void vendor payment</DialogTitle>
              </DialogHeader>
              <p>This will mark the payment as void and create a reversal entry.</p>
              {voidError ? <ErrorBanner error={voidError} /> : null}
              <div style={{ marginTop: 12 }}>
                <Button variant="secondary" onClick={() => setVoidDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={voidPayment} disabled={isLocked || voiding}>
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

function mergeBills(existing: BillRecord[], incoming: BillRecord[]) {
  const map = new Map(existing.map((bill) => [bill.id, bill]));
  for (const bill of incoming) {
    map.set(bill.id, bill);
  }
  return Array.from(map.values());
}
