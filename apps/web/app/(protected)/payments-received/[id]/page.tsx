"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  paymentReceivedCreateSchema,
  Permissions,
  type PaymentReceivedAllocationInput,
  type PaymentReceivedCreateInput,
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
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";

type CustomerRecord = { id: string; name: string; isActive: boolean };

type BankAccountRecord = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
};

type InvoiceRecord = {
  id: string;
  number?: string | null;
  status: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
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

type PaymentRecord = {
  id: string;
  number?: string | null;
  status: string;
  customerId: string;
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
  customer: { id: string; name: string };
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

const computeOutstanding = (invoice: InvoiceRecord) => {
  const totalCents = toCents(invoice.total ?? 0);
  const paidCents = toCents(invoice.amountPaid ?? 0);
  const remaining = totalCents - paidCents;
  return remaining > 0n ? remaining : 0n;
};

export default function PaymentReceivedDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const paymentId = params?.id ?? "";
  const isNew = paymentId === "new";

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
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
  const autoApplyRef = useRef(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.PAYMENT_RECEIVED_WRITE);
  const canPost = hasPermission(Permissions.PAYMENT_RECEIVED_POST);

  const form = useForm<PaymentReceivedCreateInput>({
    resolver: zodResolver(paymentReceivedCreateSchema),
    defaultValues: {
      customerId: "",
      bankAccountId: "",
      paymentDate: new Date(),
      currency: orgCurrency,
      exchangeRate: 1,
      allocations: [{ invoiceId: "", amount: 0 }],
      reference: "",
      memo: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const activeCustomers = useMemo(
    () => (Array.isArray(customers) ? customers : []).filter((customer) => customer.isActive),
    [customers],
  );
  const activeBankAccounts = useMemo(
    () => (Array.isArray(bankAccounts) ? bankAccounts : []).filter((account) => account.isActive),
    [bankAccounts],
  );

  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const allocationValues = form.watch("allocations");
  const selectedCustomerId = form.watch("customerId");
  const selectedBankAccountId = form.watch("bankAccountId");
  const bankAccountCurrency = useMemo(() => {
    const account = bankAccounts.find((item) => item.id === selectedBankAccountId);
    return account?.currency ?? null;
  }, [bankAccounts, selectedBankAccountId]);
  const isCurrencyLocked = Boolean(bankAccountCurrency);
  const paymentDateValue = form.watch("paymentDate");
  const currencyValue = form.watch("currency") || orgCurrency;
  const isLocked = isDateLocked(lockDate, paymentDateValue);
  const showMultiCurrencyWarning = currencyValue !== orgCurrency;

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
    return invoices.filter((invoice) => {
      const outstanding = computeOutstanding(invoice);
      return outstanding > 0n || selectedInvoiceIds.has(invoice.id);
    });
  }, [invoices, selectedInvoiceIds]);
  const allocationHint = !selectedCustomerId
    ? "Select a customer to see posted invoices."
    : availableInvoices.length === 0
      ? "No posted invoices to allocate for this customer."
      : null;

  const totalAmountCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => {
      return sum + toCents(allocation.amount ?? 0);
    }, 0n);
  }, [allocationValues]);

  const selectedOutstandingCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => {
      const invoice = invoiceMap.get(allocation.invoiceId);
      if (!invoice) {
        return sum;
      }
      return sum + computeOutstanding(invoice);
    }, 0n);
  }, [allocationValues, invoiceMap]);

  const remainingCents = selectedOutstandingCents - totalAmountCents;
  const formatCents = (value: bigint) => formatMoney(formatBigIntDecimal(value, 2), currencyValue);

  const isReadOnly = !canWrite || (!isNew && payment?.status !== "DRAFT");

  const loadReferenceData = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, customerData, bankResult] = await Promise.all([
        apiFetch<{ baseCurrency?: string; orgSettings?: { lockDate?: string | null } }>("/orgs/current"),
        apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
        apiFetch<BankAccountRecord[] | PaginatedResponse<BankAccountRecord>>("/bank-accounts").catch(() => []),
      ]);
      const bankData = Array.isArray(bankResult) ? bankResult : bankResult.data ?? [];
      setOrgCurrency(org.baseCurrency ?? "AED");
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setCustomers(customerData.data);
      setBankAccounts(bankData);
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load payment references.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (selectedBankAccountId) {
      const bankAccount = bankAccounts.find((account) => account.id === selectedBankAccountId);
      if (bankAccount?.currency) {
        form.setValue("currency", bankAccount.currency);
      }
    }
  }, [bankAccounts, form, selectedBankAccountId]);

  const loadPayment = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PaymentRecord>(`/payments-received/${paymentId}`);
      setPayment(data);
      const allocationDefaults = data.allocations.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        amount: Number(allocation.amount),
      }));
      form.reset({
        customerId: data.customerId,
        bankAccountId: data.bankAccountId ?? "",
        paymentDate: new Date(data.paymentDate),
        currency: data.currency,
        exchangeRate: data.exchangeRate != null ? Number(data.exchangeRate) : 1,
        allocations: allocationDefaults,
        reference: data.reference ?? "",
        memo: data.memo ?? "",
      });
      replace(allocationDefaults);
      const allocatedInvoices = data.allocations.map((allocation) => allocation.invoice);
      setInvoices((existing) => mergeInvoices(existing, allocatedInvoices));
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load payment.");
    } finally {
      setLoading(false);
    }
  }, [form, paymentId, replace]);

  const handleRetry = useCallback(() => {
    loadReferenceData();
    if (!isNew && !payment) {
      loadPayment();
    }
  }, [loadReferenceData, loadPayment, isNew, payment]);

  useEffect(() => {
    if (isNew) {
      form.reset({
        customerId: "",
        bankAccountId: "",
        paymentDate: new Date(),
        currency: orgCurrency,
        exchangeRate: 1,
        allocations: [{ invoiceId: "", amount: 0 }],
        reference: "",
        memo: "",
      });
      replace([{ invoiceId: "", amount: 0 }]);
      return;
    }



    loadPayment();
  }, [form, isNew, orgCurrency, paymentId, replace]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setInvoices([]);
      if (isNew) {
        replace([{ invoiceId: "", amount: 0 }]);
      }
      return;
    }

    let active = true;
    const loadInvoices = async () => {
        try {
          const result = await apiFetch<PaginatedResponse<InvoiceRecord>>(
            `/invoices?customerId=${selectedCustomerId}&status=POSTED`,
          );
          if (!active) {
            return;
          }
          const allocatedInvoices = payment?.allocations.map((allocation) => allocation.invoice) ?? [];
          setInvoices(mergeInvoices(result.data, allocatedInvoices));
        if (isNew) {
          replace([{ invoiceId: "", amount: 0 }]);
        }
      } catch (err) {
        if (active) {
          setActionError(err instanceof Error ? err : "Unable to load invoices.");
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [isNew, payment?.allocations, replace, selectedCustomerId]);

  const ledgerPreview = useMemo(() => {
    const bankAccount = bankAccounts.find((account) => account.id === selectedBankAccountId);
    if (!bankAccount || totalAmountCents <= 0n) {
      return [];
    }
    return [
      { label: bankAccount.name, debitCents: totalAmountCents },
      { label: "Accounts Receivable", creditCents: totalAmountCents },
    ];
  }, [bankAccounts, selectedBankAccountId, totalAmountCents]);

  const submitPayment = async (values: PaymentReceivedCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      const payload = {
        ...values,
        currency: values.currency ?? orgCurrency,
        allocations: values.allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          amount: Number(allocation.amount),
        })) as PaymentReceivedAllocationInput[],
      };

      if (isNew) {
        const created = await apiFetch<PaymentRecord>("/payments-received", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(payload),
        });
        toast({ title: "Payment draft created", description: "Draft saved successfully." });
        router.replace(`/payments-received/${created.id}`);
        return;
      }

      const updated = await apiFetch<PaymentRecord>(`/payments-received/${paymentId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setPayment(updated);
      toast({ title: "Payment saved", description: "Draft updates saved." });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save payment", err);
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
      const result = await apiFetch<{ payment: PaymentRecord }>(`/payments-received/${payment.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setPayment(result.payment);
      setPostDialogOpen(false);
      toast({ title: "Payment posted", description: "Ledger entries created." });
    } catch (err) {
      setPostError(err);
      showErrorToast("Unable to post payment", err);
    }
  };

  const voidPayment = async () => {
    if (!payment || !canPost) {
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      const result = await apiFetch<{ payment: PaymentRecord }>(`/payments-received/${payment.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setPayment(result.payment);
      setVoidDialogOpen(false);
      toast({ title: "Payment voided", description: "A reversal entry was created." });
    } catch (err) {
      setVoidError(err);
      showErrorToast("Unable to void payment", err);
    } finally {
      setVoiding(false);
    }
  };

  const updateAllocationInvoice = (index: number, invoiceId: string) => {
    form.setValue(`allocations.${index}.invoiceId`, invoiceId);
    const invoice = invoiceMap.get(invoiceId);
    if (!invoice) {
      return;
    }
    const outstanding = computeOutstanding(invoice);
    const currentAmount = Number(form.getValues(`allocations.${index}.amount`) ?? 0);
    if (currentAmount === 0 && outstanding > 0) {
      form.setValue(`allocations.${index}.amount`, Number(formatBigIntDecimal(outstanding, 2)));
    }
  };

  const handleAutoApply = useCallback(() => {
    if (isReadOnly || !selectedCustomerId) {
      return;
    }
    const allocations = [...availableInvoices]
      .map((invoice) => ({
        invoiceId: invoice.id,
        amount: Number(formatBigIntDecimal(computeOutstanding(invoice), 2)),
        invoiceDate: invoice.invoiceDate,
      }))
      .filter((allocation) => allocation.amount > 0)
      .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
      .map(({ invoiceId, amount }) => ({ invoiceId, amount }));
    replace(allocations.length > 0 ? allocations : [{ invoiceId: "", amount: 0 }]);
  }, [availableInvoices, isReadOnly, replace, selectedCustomerId]);

  useEffect(() => {
    autoApplyRef.current = false;
  }, [selectedCustomerId, isNew]);

  useEffect(() => {
    if (!isNew || isReadOnly || !selectedCustomerId) {
      return;
    }
    if (autoApplyRef.current) {
      return;
    }
    const hasManualAllocations = (allocationValues ?? []).some(
      (allocation) => allocation.invoiceId || Number(allocation.amount ?? 0) > 0,
    );
    if (hasManualAllocations || availableInvoices.length === 0) {
      return;
    }
    handleAutoApply();
    autoApplyRef.current = true;
  }, [allocationValues, availableInvoices.length, handleAutoApply, isNew, isReadOnly, selectedCustomerId]);

  if (loading) {
    return (
      <div className="card">
        <PageHeader
          title="Payments Received"
          heading={isNew ? "Receive Payment" : "Payment"}
          description="Loading payment details."
          icon={<CreditCard className="h-5 w-5" />}
        />
        <p className="muted">Loading payment...</p>
      </div>
    );
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <PageHeader
          title="Payments Received"
          heading="Receive Payment"
          description="You do not have permission to record payments."
          icon={<CreditCard className="h-5 w-5" />}
        />
        <Button variant="secondary" onClick={() => router.push("/payments-received")}>
          Back to payments
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && payment?.updatedAt ? formatDateTime(payment.updatedAt) : null;
  const postedAt = !isNew && payment?.postedAt ? formatDateTime(payment.postedAt) : null;

  const headerHeading = isNew ? "Receive Payment" : payment?.number ?? "Draft Payment";
  const headerDescription = isNew
    ? "Record a customer payment allocation."
    : `${payment?.customer?.name ?? "Customer"} | ${payment?.currency ?? orgCurrency}`;
  const headerMeta =
    !isNew && (lastSavedAt || postedAt) ? (
      <p className="muted">
        {lastSavedAt ? `Last saved at ${lastSavedAt}` : null}
        {lastSavedAt && postedAt ? " • " : null}
        {postedAt ? `Posted at ${postedAt}` : null}
      </p>
    ) : null;

  return (
    <div className="card">
      <PageHeader
        title="Payments Received"
        heading={headerHeading}
        description={headerDescription}
        meta={headerMeta}
        icon={<CreditCard className="h-5 w-5" />}
        actions={!isNew ? <StatusChip status={payment?.status ?? "DRAFT"} /> : null}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={handleRetry} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={paymentDateValue} actionLabel="saving or posting" />
      {showMultiCurrencyWarning ? (
        <p className="form-error">Multi-currency is not fully supported yet. Review exchange rates before posting.</p>
      ) : null}

      <form onSubmit={form.handleSubmit(submitPayment)}>
        <div className="form-grid">
          <label>
            Customer *
            <Controller
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isReadOnly}>
                  <SelectTrigger aria-label="Customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCustomers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {renderFieldError(form.formState.errors.customerId?.message)}
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
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.paymentDate?.message)}
          </label>
          <label>
            Currency *
            <Input
              disabled={isReadOnly}
              readOnly={isCurrencyLocked}
              aria-readonly={isCurrencyLocked}
              {...form.register("currency")}
            />
            {renderFieldError(form.formState.errors.currency?.message)}
            {isCurrencyLocked ? <p className="muted">Currency is set by the bank account.</p> : null}
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
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {!isReadOnly ? (
              <Button
                type="button"
                variant="secondary"
                onClick={handleAutoApply}
                disabled={!selectedCustomerId || availableInvoices.length === 0}
              >
                Auto-apply remaining
              </Button>
            ) : null}
            <strong>Total: {formatCents(totalAmountCents)}</strong>
          </div>
        </div>
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
            {fields.map((field, index) => {
              const selectedInvoice = invoiceMap.get(form.getValues(`allocations.${index}.invoiceId`));
              const outstanding = selectedInvoice ? computeOutstanding(selectedInvoice) : 0n;
              const allocationCents = toCents(form.getValues(`allocations.${index}.amount`) ?? 0);
              const overAllocated = selectedInvoice ? allocationCents > outstanding : false;
              const overAllocatedBy = overAllocated ? allocationCents - outstanding : 0n;

              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <Controller
                      control={form.control}
                      name={`allocations.${index}.invoiceId`}
                      render={({ field }) => (
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(value) => {
                            field.onChange(value);
                            updateAllocationInvoice(index, value);
                          }}
                          disabled={isReadOnly || availableInvoices.length === 0}
                        >
                          <SelectTrigger aria-label="Invoice">
                            <SelectValue placeholder="Select invoice" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableInvoices.map((invoice) => (
                              <SelectItem key={invoice.id} value={invoice.id}>
                                {invoice.number ?? "Draft"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(form.formState.errors.allocations?.[index]?.invoiceId?.message)}
                  </TableCell>
                  <TableCell>
                    {selectedInvoice ? formatMoney(formatBigIntDecimal(outstanding, 2), selectedInvoice.currency) : "-"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isReadOnly}
                      {...form.register(`allocations.${index}.amount`, { valueAsNumber: true })}
                      className={overAllocated ? "border-destructive focus-visible:ring-destructive" : undefined}
                    />
                    {overAllocated && selectedInvoice ? (
                      <p className="form-error">
                        Exceeds outstanding by {formatMoney(formatBigIntDecimal(overAllocatedBy, 2), selectedInvoice.currency)}
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => append({ invoiceId: "", amount: 0 })}
            disabled={availableInvoices.length === 0}
          >
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
                <DialogTitle>Post Payment</DialogTitle>
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
                <DialogTitle>Void payment</DialogTitle>
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

function mergeInvoices(existing: InvoiceRecord[], incoming: InvoiceRecord[]) {
  const map = new Map(existing.map((invoice) => [invoice.id, invoice]));
  for (const invoice of incoming) {
    map.set(invoice.id, invoice);
  }
  return Array.from(map.values());
}
