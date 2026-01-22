"use client";

import { useEffect, useMemo, useState } from "react";
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
import { formatMoney } from "../../../../src/lib/format";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../../src/lib/ui-status-chip";

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

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

const computeOutstanding = (invoice: InvoiceRecord) => {
  const total = typeof invoice.total === "string" ? Number(invoice.total) : invoice.total;
  const paid = typeof invoice.amountPaid === "string" ? Number(invoice.amountPaid) : Number(invoice.amountPaid ?? 0);
  return roundMoney(total - paid);
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
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
      allocations: [{ invoiceId: "", amount: 0 }],
      reference: "",
      memo: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const activeBankAccounts = useMemo(() => bankAccounts.filter((account) => account.isActive), [bankAccounts]);

  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const allocationValues = form.watch("allocations");
  const selectedCustomerId = form.watch("customerId");
  const selectedBankAccountId = form.watch("bankAccountId");
  const currencyValue = form.watch("currency") || orgCurrency;
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
      return outstanding > 0 || selectedInvoiceIds.has(invoice.id);
    });
  }, [invoices, selectedInvoiceIds]);

  const totalAmount = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => {
      const amount = Number(allocation.amount ?? 0);
      return roundMoney(sum + amount);
    }, 0);
  }, [allocationValues]);

  const isReadOnly = !canWrite || (!isNew && payment?.status !== "DRAFT");

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
          const [org, customerData, bankData] = await Promise.all([
            apiFetch<{ baseCurrency?: string }>("/orgs/current"),
            apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
            apiFetch<BankAccountRecord[]>("/bank-accounts").catch(() => []),
          ]);
          setOrgCurrency(org.baseCurrency ?? "AED");
          setCustomers(customerData.data);
        setBankAccounts(bankData);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load payment references.");
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
        customerId: "",
        bankAccountId: "",
        paymentDate: new Date(),
        currency: orgCurrency,
        allocations: [{ invoiceId: "", amount: 0 }],
        reference: "",
        memo: "",
      });
      replace([{ invoiceId: "", amount: 0 }]);
      return;
    }

    const loadPayment = async () => {
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
          exchangeRate: data.exchangeRate ? Number(data.exchangeRate) : undefined,
          allocations: allocationDefaults,
          reference: data.reference ?? "",
          memo: data.memo ?? "",
        });
        replace(allocationDefaults);
        const allocatedInvoices = data.allocations.map((allocation) => allocation.invoice);
        setInvoices((existing) => mergeInvoices(existing, allocatedInvoices));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load payment.");
      } finally {
        setLoading(false);
      }
    };

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
          setActionError(err instanceof Error ? err.message : "Unable to load invoices.");
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
    if (!bankAccount || totalAmount <= 0) {
      return [];
    }
    return [
      { label: bankAccount.name, debit: totalAmount },
      { label: "Accounts Receivable", credit: totalAmount },
    ];
  }, [bankAccounts, selectedBankAccountId, totalAmount]);

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
        router.replace(`/payments-received/${created.id}`);
        return;
      }

      const updated = await apiFetch<PaymentRecord>(`/payments-received/${paymentId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setPayment(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save payment.");
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
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Unable to post payment.");
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
      form.setValue(`allocations.${index}.amount`, outstanding);
    }
  };

  if (loading) {
    return <div className="card">Loading payment...</div>;
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <h1>Payments Received</h1>
        <p className="muted">You do not have permission to record payments.</p>
        <Button variant="secondary" onClick={() => router.push("/payments-received")}>
          Back to payments
        </Button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "Receive Payment" : payment?.number ?? "Draft Payment"}</h1>
          <p className="muted">
            {isNew
              ? "Record a customer payment allocation."
              : `${payment?.customer?.name ?? "Customer"} | ${payment?.currency ?? orgCurrency}`}
          </p>
        </div>
        {!isNew ? (
          <StatusChip status={payment?.status ?? "DRAFT"} />
        ) : null}
      </div>

      {actionError ? <p className="form-error">{actionError}</p> : null}
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
        <h2>Allocations</h2>
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
              const outstanding = selectedInvoice ? computeOutstanding(selectedInvoice) : 0;

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
                          disabled={isReadOnly}
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
                  <TableCell>{selectedInvoice ? formatMoney(outstanding, selectedInvoice.currency) : "-"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isReadOnly}
                      {...form.register(`allocations.${index}.amount`, { valueAsNumber: true })}
                    />
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
          <Button type="button" variant="secondary" onClick={() => append({ invoiceId: "", amount: 0 })}>
            Add Allocation
          </Button>
        ) : null}

        <div style={{ height: 16 }} />
        <div className="section-header">
          <strong>Total</strong>
          <span>{formatMoney(totalAmount, currencyValue)}</span>
        </div>

        <div style={{ height: 16 }} />
        {!isReadOnly ? (
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Payment"}
          </Button>
        ) : null}
      </form>

      {!isNew && payment?.status === "DRAFT" && canPost ? (
        <div style={{ marginTop: 16 }}>
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button>Post Payment</Button>
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
                        {line.debit ? `Debit ${line.label} ${formatMoney(line.debit, currencyValue)}` : null}
                        {line.credit ? `Credit ${line.label} ${formatMoney(line.credit, currencyValue)}` : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {postError ? <p className="form-error">{postError}</p> : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setPostDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={postPayment}>Post Payment</Button>
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
