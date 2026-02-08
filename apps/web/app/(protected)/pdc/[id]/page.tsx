"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  pdcCreateSchema,
  Permissions,
  type PdcAllocationInput,
  type PdcCreateInput,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../src/lib/ui-dialog";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";
import { ValidationSummary } from "../../../../src/lib/ui-validation-summary";

type CustomerRecord = { id: string; name: string; isActive: boolean };
type VendorRecord = { id: string; name: string; isActive: boolean };

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
  invoiceId?: string | null;
  billId?: string | null;
  amount: string | number;
  invoice?: InvoiceRecord | null;
  bill?: BillRecord | null;
};

type PdcRecord = {
  id: string;
  number?: string | null;
  direction: "INCOMING" | "OUTGOING";
  status: "DRAFT" | "SCHEDULED" | "DEPOSITED" | "CLEARED" | "BOUNCED" | "CANCELLED";
  customerId?: string | null;
  vendorId?: string | null;
  bankAccountId: string;
  chequeNumber: string;
  chequeDate: string;
  expectedClearDate: string;
  depositedAt?: string | null;
  clearedAt?: string | null;
  bouncedAt?: string | null;
  cancelledAt?: string | null;
  currency: string;
  exchangeRate?: string | number | null;
  amountTotal: string | number;
  reference?: string | null;
  memo?: string | null;
  updatedAt?: string;
  allocations: AllocationRecord[];
  customer?: { id: string; name: string } | null;
  vendor?: { id: string; name: string } | null;
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

const computeOutstanding = (total: string | number, paid: string | number | null | undefined) => {
  const totalCents = toCents(total ?? 0);
  const paidCents = toCents(paid ?? 0);
  const remaining = totalCents - paidCents;
  return remaining > 0n ? remaining : 0n;
};

const resolveBillNumber = (bill: BillRecord) => bill.systemNumber ?? bill.billNumber ?? "Draft";

export default function PdcDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pdcId = params?.id ?? "";
  const isNew = pdcId === "new";

  const [pdc, setPdc] = useState<PdcRecord | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "schedule" | "deposit" | "clear" | "bounce" | "cancel">(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.PDC_WRITE);
  const canPost = hasPermission(Permissions.PDC_POST);

  const form = useForm<PdcCreateInput>({
    resolver: zodResolver(pdcCreateSchema),
    defaultValues: {
      direction: "INCOMING",
      customerId: "",
      vendorId: "",
      bankAccountId: "",
      chequeNumber: "",
      chequeDate: new Date(),
      expectedClearDate: new Date(),
      currency: orgCurrency,
      exchangeRate: 1,
      allocations: [{ invoiceId: "", billId: "", amount: 0 }],
      reference: "",
      memo: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const direction = form.watch("direction");
  const selectedCustomerId = form.watch("customerId");
  const selectedVendorId = form.watch("vendorId");
  const selectedBankAccountId = form.watch("bankAccountId");
  const expectedClearDate = form.watch("expectedClearDate");
  const allocationValues = form.watch("allocations");

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.isActive), [vendors]);
  const activeBankAccounts = useMemo(() => bankAccounts.filter((account) => account.isActive), [bankAccounts]);

  const bankAccountCurrency = useMemo(() => {
    const account = bankAccounts.find((item) => item.id === selectedBankAccountId);
    return account?.currency ?? null;
  }, [bankAccounts, selectedBankAccountId]);
  const isCurrencyLocked = Boolean(bankAccountCurrency);
  const currencyValue = form.watch("currency") || orgCurrency;
  const isLocked = isDateLocked(lockDate, expectedClearDate);

  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const billMap = useMemo(() => new Map(bills.map((bill) => [bill.id, bill])), [bills]);

  const selectedDocIds = useMemo(() => {
    const ids = new Set<string>();
    for (const allocation of allocationValues ?? []) {
      const documentId = direction === "INCOMING" ? allocation.invoiceId : allocation.billId;
      if (documentId) {
        ids.add(documentId);
      }
    }
    return ids;
  }, [allocationValues, direction]);

  const availableInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const outstanding = computeOutstanding(invoice.total, invoice.amountPaid);
      return outstanding > 0n || selectedDocIds.has(invoice.id);
    });
  }, [invoices, selectedDocIds]);

  const availableBills = useMemo(() => {
    return bills.filter((bill) => {
      const outstanding = computeOutstanding(bill.total, bill.amountPaid);
      return outstanding > 0n || selectedDocIds.has(bill.id);
    });
  }, [bills, selectedDocIds]);

  const totalAmountCents = useMemo(() => {
    return (allocationValues ?? []).reduce((sum, allocation) => sum + toCents(allocation.amount ?? 0), 0n);
  }, [allocationValues]);
  const formatCents = (value: bigint) => formatMoney(formatBigIntDecimal(value, 2), currencyValue);

  const isEditableStatus = isNew || pdc?.status === "DRAFT" || pdc?.status === "SCHEDULED";
  const isReadOnly = !canWrite || !isEditableStatus;

  const canSchedule = !isNew && pdc?.status === "DRAFT" && canWrite;
  const canDeposit = !isNew && pdc?.status === "SCHEDULED" && canWrite;
  const canClear = !isNew && (pdc?.status === "SCHEDULED" || pdc?.status === "DEPOSITED") && canPost;
  const canBounce =
    !isNew && (pdc?.status === "SCHEDULED" || pdc?.status === "DEPOSITED" || pdc?.status === "CLEARED") && canPost;
  const canCancel = !isNew && (pdc?.status === "DRAFT" || pdc?.status === "SCHEDULED" || pdc?.status === "DEPOSITED") && canWrite;

  const loadReferenceData = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, customerResult, vendorResult, bankResult] = await Promise.all([
        apiFetch<{ baseCurrency?: string; orgSettings?: { lockDate?: string | null } }>("/orgs/current"),
        apiFetch<PaginatedResponse<CustomerRecord> | CustomerRecord[]>("/customers"),
        apiFetch<PaginatedResponse<VendorRecord> | VendorRecord[]>("/vendors"),
        apiFetch<PaginatedResponse<BankAccountRecord> | BankAccountRecord[]>("/bank-accounts").catch(() => []),
      ]);
      const customerData = Array.isArray(customerResult) ? customerResult : customerResult.data ?? [];
      const vendorData = Array.isArray(vendorResult) ? vendorResult : vendorResult.data ?? [];
      const bankData = Array.isArray(bankResult) ? bankResult : bankResult.data ?? [];
      setOrgCurrency(org.baseCurrency ?? "AED");
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setCustomers(customerData);
      setVendors(vendorData);
      setBankAccounts(bankData);
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load PDC references.");
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

  const loadPdc = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PdcRecord>(`/pdc/${pdcId}`);
      setPdc(data);
      const allocationDefaults = data.allocations.map((allocation) => ({
        invoiceId: allocation.invoiceId ?? "",
        billId: allocation.billId ?? "",
        amount: Number(allocation.amount),
      }));
      form.reset({
        direction: data.direction,
        customerId: data.customerId ?? "",
        vendorId: data.vendorId ?? "",
        bankAccountId: data.bankAccountId,
        chequeNumber: data.chequeNumber,
        chequeDate: new Date(data.chequeDate),
        expectedClearDate: new Date(data.expectedClearDate),
        currency: data.currency,
        exchangeRate: data.exchangeRate != null ? Number(data.exchangeRate) : 1,
        allocations: allocationDefaults,
        reference: data.reference ?? "",
        memo: data.memo ?? "",
      });
      replace(allocationDefaults);
      setInvoices((existing) =>
        mergeInvoices(existing, data.allocations.map((allocation) => allocation.invoice).filter(Boolean) as InvoiceRecord[]),
      );
      setBills((existing) =>
        mergeBills(existing, data.allocations.map((allocation) => allocation.bill).filter(Boolean) as BillRecord[]),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load PDC.");
    } finally {
      setLoading(false);
    }
  }, [form, pdcId, replace]);

  useEffect(() => {
    if (isNew) {
      form.reset({
        direction: "INCOMING",
        customerId: "",
        vendorId: "",
        bankAccountId: "",
        chequeNumber: "",
        chequeDate: new Date(),
        expectedClearDate: new Date(),
        currency: orgCurrency,
        exchangeRate: 1,
        allocations: [{ invoiceId: "", billId: "", amount: 0 }],
        reference: "",
        memo: "",
      });
      replace([{ invoiceId: "", billId: "", amount: 0 }]);
      return;
    }

    loadPdc();
  }, [form, isNew, loadPdc, orgCurrency, replace]);

  useEffect(() => {
    if (direction === "INCOMING") {
      form.setValue("vendorId", "");
    } else {
      form.setValue("customerId", "");
    }
    if (isNew) {
      replace([{ invoiceId: "", billId: "", amount: 0 }]);
    }
  }, [direction, form, isNew, replace]);

  useEffect(() => {
    if (direction !== "INCOMING" || !selectedCustomerId) {
      setInvoices([]);
      return;
    }
    let active = true;
    const loadInvoices = async () => {
      try {
        const result = await apiFetch<PaginatedResponse<InvoiceRecord> | InvoiceRecord[]>(
          `/invoices?customerId=${selectedCustomerId}&status=POSTED`,
        );
        if (!active) {
          return;
        }
        const data = Array.isArray(result) ? result : result.data ?? [];
        setInvoices(data);
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
  }, [direction, selectedCustomerId]);

  useEffect(() => {
    if (direction !== "OUTGOING" || !selectedVendorId) {
      setBills([]);
      return;
    }
    let active = true;
    const loadBills = async () => {
      try {
        const result = await apiFetch<PaginatedResponse<BillRecord> | BillRecord[]>(
          `/bills?vendorId=${selectedVendorId}&status=POSTED`,
        );
        if (!active) {
          return;
        }
        const data = Array.isArray(result) ? result : result.data ?? [];
        setBills(data);
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
  }, [direction, selectedVendorId]);

  const submitPdc = async (values: PdcCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      const normalizedAllocations = values.allocations.map((allocation) => {
        if (values.direction === "INCOMING") {
          return {
            invoiceId: allocation.invoiceId || undefined,
            amount: Number(allocation.amount),
          };
        }
        return {
          billId: allocation.billId || undefined,
          amount: Number(allocation.amount),
        };
      }) as PdcAllocationInput[];

      const payload: PdcCreateInput = {
        ...values,
        customerId: values.direction === "INCOMING" ? values.customerId || undefined : undefined,
        vendorId: values.direction === "OUTGOING" ? values.vendorId || undefined : undefined,
        currency: values.currency ?? orgCurrency,
        allocations: normalizedAllocations,
      };

      if (isNew) {
        const created = await apiFetch<PdcRecord>("/pdc", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(payload),
        });
        toast({ title: "PDC draft created", description: "Draft saved successfully." });
        router.replace(`/pdc/${created.id}`);
        return;
      }

      const updated = await apiFetch<PdcRecord>(`/pdc/${pdcId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setPdc(updated);
      toast({ title: "PDC saved", description: "Draft updates saved." });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save PDC", err);
    } finally {
      setSaving(false);
    }
  };

  const runStatusAction = async (action: "schedule" | "deposit" | "clear" | "bounce" | "cancel") => {
    if (!pdc) {
      return;
    }
    setActionLoading(action);
    try {
      const endpoint = `/pdc/${pdc.id}/${action}`;
      const response = await apiFetch<PdcRecord | { pdc: PdcRecord }>(endpoint, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      const updated = "pdc" in response ? response.pdc : response;
      setPdc(updated);
      setActionDialogOpen(false);
      setConfirmAction(null);
      toast({
        title: "PDC updated",
        description:
          action === "clear"
            ? "PDC cleared and posted to ledger."
            : action === "bounce"
              ? "PDC bounced."
              : action === "cancel"
                ? "PDC cancelled."
                : action === "deposit"
                  ? "PDC marked as deposited."
                  : "PDC scheduled.",
      });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to update PDC status", err);
    } finally {
      setActionLoading(null);
    }
  };

  const updateAllocationDocument = (index: number, documentId: string) => {
    if (direction === "INCOMING") {
      form.setValue(`allocations.${index}.invoiceId`, documentId);
      form.setValue(`allocations.${index}.billId`, "");
      const invoice = invoiceMap.get(documentId);
      if (!invoice) {
        return;
      }
      const outstanding = computeOutstanding(invoice.total, invoice.amountPaid);
      if (outstanding > 0n) {
        form.setValue(`allocations.${index}.amount`, Number(formatBigIntDecimal(outstanding, 2)));
      }
      return;
    }

    form.setValue(`allocations.${index}.billId`, documentId);
    form.setValue(`allocations.${index}.invoiceId`, "");
    const bill = billMap.get(documentId);
    if (!bill) {
      return;
    }
    const outstanding = computeOutstanding(bill.total, bill.amountPaid);
    if (outstanding > 0n) {
      form.setValue(`allocations.${index}.amount`, Number(formatBigIntDecimal(outstanding, 2)));
    }
  };

  if (loading) {
    return <div className="card">Loading PDC...</div>;
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <h1>PDC Management</h1>
        <p className="muted">You do not have permission to create PDC records.</p>
        <Button variant="secondary" onClick={() => router.push("/pdc")}>
          Back to PDC list
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && pdc?.updatedAt ? formatDateTime(pdc.updatedAt) : null;
  const statusDateLabel = !isNew
    ? pdc?.clearedAt
      ? `Cleared at ${formatDateTime(pdc.clearedAt)}`
      : pdc?.depositedAt
        ? `Deposited at ${formatDateTime(pdc.depositedAt)}`
        : pdc?.bouncedAt
          ? `Bounced at ${formatDateTime(pdc.bouncedAt)}`
          : pdc?.cancelledAt
            ? `Cancelled at ${formatDateTime(pdc.cancelledAt)}`
            : null
    : null;

  const availableDocuments = direction === "INCOMING" ? availableInvoices : availableBills;
  const scheduledHelp =
    !isNew && pdc?.status === "SCHEDULED"
      ? "Scheduled: cheque recorded but not yet deposited."
      : null;

  return (
    <div className="card">
      <PageHeader
        title="PDC Management"
        heading={isNew ? "New PDC" : pdc?.number ?? pdc?.chequeNumber ?? "PDC"}
        description={
          isNew
            ? "Create and manage post-dated cheque lifecycle."
            : `${pdc?.direction === "INCOMING" ? pdc?.customer?.name ?? "Customer" : pdc?.vendor?.name ?? "Vendor"} | ${pdc?.currency ?? orgCurrency}`
        }
        icon={<Banknote className="h-5 w-5" />}
        meta={
          !isNew && (lastSavedAt || statusDateLabel) ? (
            <p className="muted">
              {lastSavedAt ? `Last saved at ${lastSavedAt}` : null}
              {lastSavedAt && statusDateLabel ? " - " : null}
              {statusDateLabel ? statusDateLabel : null}
            </p>
          ) : null
        }
        actions={
          !isNew ? (
            <div className="flex flex-col items-end gap-1">
              <StatusChip status={pdc?.status ?? "DRAFT"} />
              {scheduledHelp ? <p className="muted text-xs">{scheduledHelp}</p> : null}
            </div>
          ) : null
        }
      />

      {actionError ? <ErrorBanner error={actionError} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={expectedClearDate} actionLabel="posting and status actions" />
      {form.formState.submitCount > 0 ? <ValidationSummary errors={form.formState.errors} /> : null}

      <form onSubmit={form.handleSubmit(submitPdc)}>
        <div className="form-grid">
          <label>
            Cheque Direction *
            <Controller
              control={form.control}
              name="direction"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={!isNew || isReadOnly}>
                  <SelectTrigger aria-label="Direction">
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOMING">Received Cheque</SelectItem>
                    <SelectItem value="OUTGOING">Issued Cheque</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {renderFieldError(form.formState.errors.direction?.message)}
          </label>

          {direction === "INCOMING" ? (
            <label>
              Customer *
              <Controller
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isReadOnly}>
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
          ) : (
            <label>
              Vendor *
              <Controller
                control={form.control}
                name="vendorId"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isReadOnly}>
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
          )}

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
            Cheque Number *
            <Input disabled={isReadOnly} {...form.register("chequeNumber")} />
            {renderFieldError(form.formState.errors.chequeNumber?.message)}
          </label>

          <label>
            Cheque Date *
            <Controller
              control={form.control}
              name="chequeDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.chequeDate?.message)}
          </label>

          <label>
            Expected Clear Date *
            <Controller
              control={form.control}
              name="expectedClearDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.expectedClearDate?.message)}
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
            <p className="muted">
              {direction === "INCOMING" ? "Allocate against posted invoices." : "Allocate against posted bills."}
            </p>
          </div>
          <div>
            <strong>Total: {formatCents(totalAmountCents)}</strong>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{direction === "INCOMING" ? "Invoice" : "Bill"}</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const selectedId =
                direction === "INCOMING"
                  ? form.getValues(`allocations.${index}.invoiceId`)
                  : form.getValues(`allocations.${index}.billId`);
              const selectedInvoice = selectedId ? invoiceMap.get(selectedId) : null;
              const selectedBill = selectedId ? billMap.get(selectedId) : null;
              const outstanding =
                direction === "INCOMING"
                  ? computeOutstanding(selectedInvoice?.total ?? 0, selectedInvoice?.amountPaid)
                  : computeOutstanding(selectedBill?.total ?? 0, selectedBill?.amountPaid);
              const allocationCents = toCents(form.getValues(`allocations.${index}.amount`) ?? 0);
              const overAllocated = allocationCents > outstanding;
              const overAllocatedBy = overAllocated ? allocationCents - outstanding : 0n;

              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <Select
                      value={(selectedId as string) ?? ""}
                      onValueChange={(value) => updateAllocationDocument(index, value)}
                      disabled={isReadOnly || availableDocuments.length === 0}
                    >
                      <SelectTrigger aria-label={direction === "INCOMING" ? "Invoice" : "Bill"}>
                        <SelectValue placeholder={`Select ${direction === "INCOMING" ? "invoice" : "bill"}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {direction === "INCOMING"
                          ? availableInvoices.map((invoice) => (
                              <SelectItem key={invoice.id} value={invoice.id}>
                                {invoice.number ?? "Draft"}
                              </SelectItem>
                            ))
                          : availableBills.map((bill) => (
                              <SelectItem key={bill.id} value={bill.id}>
                                {resolveBillNumber(bill)}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                    {direction === "INCOMING"
                      ? renderFieldError(form.formState.errors.allocations?.[index]?.invoiceId?.message)
                      : renderFieldError(form.formState.errors.allocations?.[index]?.billId?.message)}
                  </TableCell>
                  <TableCell>
                    {direction === "INCOMING"
                      ? selectedInvoice
                        ? formatMoney(formatBigIntDecimal(outstanding, 2), selectedInvoice.currency)
                        : "-"
                      : selectedBill
                        ? formatMoney(formatBigIntDecimal(outstanding, 2), selectedBill.currency)
                        : "-"}
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
                    {overAllocated ? (
                      <p className="form-error">
                        Exceeds outstanding by {formatMoney(formatBigIntDecimal(overAllocatedBy, 2), currencyValue)}
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
            onClick={() => append({ invoiceId: "", billId: "", amount: 0 })}
            disabled={availableDocuments.length === 0}
          >
            Add Allocation
          </Button>
        ) : null}

        <div style={{ height: 16 }} />
        {!isReadOnly ? (
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save PDC"}
          </Button>
        ) : null}
      </form>

      {!isNew ? (
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {canSchedule ? (
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmAction("schedule");
                setActionDialogOpen(true);
              }}
            >
              Schedule
            </Button>
          ) : null}
          {canDeposit ? (
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmAction("deposit");
                setActionDialogOpen(true);
              }}
            >
              Mark Deposited
            </Button>
          ) : null}
          {canClear ? (
            <Button
              onClick={() => {
                setConfirmAction("clear");
                setActionDialogOpen(true);
              }}
              disabled={isLocked}
            >
              Clear PDC
            </Button>
          ) : null}
          {canBounce ? (
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmAction("bounce");
                setActionDialogOpen(true);
              }}
              disabled={isLocked}
            >
              Mark Bounced
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmAction("cancel");
                setActionDialogOpen(true);
              }}
            >
              Cancel PDC
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "clear"
                ? "Clear PDC"
                : confirmAction === "bounce"
                  ? "Mark PDC as bounced"
                  : confirmAction === "cancel"
                    ? "Cancel PDC"
                    : confirmAction === "deposit"
                      ? "Mark as deposited"
                      : "Schedule PDC"}
            </DialogTitle>
          </DialogHeader>
          <p>
            {confirmAction === "clear"
              ? "This will post ledger entries and settle allocations."
              : confirmAction === "bounce"
                ? "If the cheque was already cleared, a reversal entry will be created."
                : confirmAction === "cancel"
                  ? "This will mark the cheque as cancelled."
                  : confirmAction === "deposit"
                    ? "This marks the cheque as deposited with the bank."
                    : "This moves the cheque to scheduled status."}
          </p>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="secondary" onClick={() => setActionDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant={confirmAction === "bounce" || confirmAction === "cancel" ? "destructive" : "default"}
              onClick={() => (confirmAction ? runStatusAction(confirmAction) : undefined)}
              disabled={!confirmAction || Boolean(actionLoading)}
            >
              {actionLoading ? "Working..." : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

function mergeBills(existing: BillRecord[], incoming: BillRecord[]) {
  const map = new Map(existing.map((bill) => [bill.id, bill]));
  for (const bill of incoming) {
    map.set(bill.id, bill);
  }
  return Array.from(map.values());
}
