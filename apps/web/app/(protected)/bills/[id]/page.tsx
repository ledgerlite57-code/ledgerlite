"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { billCreateSchema, Permissions, type BillCreateInput, type BillLineCreateInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDateTime, formatMoney } from "../../../../src/lib/format";
import { calculateGrossCents, calculateTaxCents, formatBigIntDecimal, toCents } from "../../../../src/lib/money";
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
import { ItemCombobox } from "../../../../src/lib/ui-item-combobox";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";

type VendorRecord = { id: string; name: string; isActive: boolean; paymentTermsDays: number };

type ItemRecord = {
  id: string;
  name: string;
  purchasePrice?: string | number | null;
  expenseAccountId: string;
  defaultTaxCodeId?: string | null;
  isActive: boolean;
};

type TaxCodeRecord = { id: string; name: string; rate: string | number; type: string; isActive: boolean };

type AccountRecord = { id: string; name: string; subtype?: string | null; type: string; isActive: boolean };

type BillLineRecord = {
  id: string;
  itemId?: string | null;
  expenseAccountId: string;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  taxCodeId?: string | null;
  lineSubTotal: string | number;
  lineTax: string | number;
  lineTotal: string | number;
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
  exchangeRate?: string | number | null;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  notes?: string | null;
  updatedAt?: string;
  postedAt?: string | null;
  lines: BillLineRecord[];
  vendor: { id: string; name: string };
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

export default function BillDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const billId = params?.id ?? "";
  const isNew = billId === "new";

  const [bill, setBill] = useState<BillRecord | null>(null);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [itemSearchResults, setItemSearchResults] = useState<ItemRecord[]>([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [vatEnabled, setVatEnabled] = useState(false);
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
  const canWrite = hasPermission(Permissions.BILL_WRITE);
  const canPost = hasPermission(Permissions.BILL_POST);

  const form = useForm<BillCreateInput>({
    resolver: zodResolver(billCreateSchema),
    defaultValues: {
      vendorId: "",
      billDate: new Date(),
      dueDate: new Date(),
      currency: orgCurrency,
      billNumber: "",
      lines: [
        {
          expenseAccountId: "",
          itemId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          taxCodeId: "",
        },
      ],
      notes: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.isActive), [vendors]);
  const activeTaxCodes = useMemo(() => taxCodes.filter((code) => code.isActive), [taxCodes]);
  const expenseAccounts = useMemo(
    () => accounts.filter((account) => account.type === "EXPENSE" && account.isActive),
    [accounts],
  );

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxCodesById = useMemo(() => new Map(taxCodes.map((code) => [code.id, code])), [taxCodes]);

  const isReadOnly = !canWrite || (!isNew && bill?.status !== "DRAFT");

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const [org, vendorData, taxData, accountData] = await Promise.all([
          apiFetch<{ baseCurrency?: string; vatEnabled?: boolean; orgSettings?: { lockDate?: string | null } }>(
            "/orgs/current",
          ),
          apiFetch<VendorRecord[]>("/vendors"),
          apiFetch<TaxCodeRecord[]>("/tax-codes").catch(() => []),
          apiFetch<AccountRecord[]>("/accounts").catch(() => []),
        ]);
        setOrgCurrency(org.baseCurrency ?? "AED");
        setVatEnabled(Boolean(org.vatEnabled));
        setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
        setVendors(vendorData);
        setTaxCodes(taxData);
        setAccounts(accountData);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load bill references.");
      } finally {
        setLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setItemSearchLoading(true);
      try {
        const params = new URLSearchParams();
        const trimmed = itemSearchTerm.trim();
        if (trimmed) {
          params.set("search", trimmed);
        }
        params.set("isActive", "true");
        const data = await apiFetch<ItemRecord[]>(`/items?${params.toString()}`);
        if (!active) {
          return;
        }
        setItemSearchResults(data);
        setItems((prev) => {
          const merged = new Map(prev.map((item) => [item.id, item]));
          data.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values());
        });
      } catch {
        if (active) {
          setItemSearchResults([]);
        }
      } finally {
        if (active) {
          setItemSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [itemSearchTerm]);

  useEffect(() => {
    if (!bill?.lines?.length) {
      return;
    }
    const missingIds = Array.from(
      new Set(bill.lines.map((line) => line.itemId).filter((id): id is string => Boolean(id))),
    ).filter((id) => !itemsById.has(id));
    if (missingIds.length === 0) {
      return;
    }
    let active = true;
    const loadMissing = async () => {
      try {
        const results = await Promise.all(missingIds.map((id) => apiFetch<ItemRecord>(`/items/${id}`)));
        if (!active) {
          return;
        }
        setItems((prev) => {
          const merged = new Map(prev.map((item) => [item.id, item]));
          results.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values());
        });
      } catch {
        // ignore missing item lookups
      }
    };
    loadMissing();
    return () => {
      active = false;
    };
  }, [bill, itemsById]);

  useEffect(() => {
    if (isNew) {
      form.reset({
        vendorId: "",
        billDate: new Date(),
        dueDate: new Date(),
        currency: orgCurrency,
        billNumber: "",
        lines: [
          {
            expenseAccountId: "",
            itemId: "",
            description: "",
            qty: 1,
            unitPrice: 0,
            discountAmount: 0,
            taxCodeId: "",
          },
        ],
        notes: "",
      });
      replace([
        {
          expenseAccountId: "",
          itemId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          taxCodeId: "",
        },
      ]);
      return;
    }

    const loadBill = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<BillRecord>(`/bills/${billId}`);
        setBill(data);
        const lineDefaults = data.lines.map((line) => ({
          expenseAccountId: line.expenseAccountId,
          itemId: line.itemId ?? "",
          description: line.description ?? "",
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
          discountAmount: Number(line.discountAmount ?? 0),
          taxCodeId: line.taxCodeId ?? "",
        }));
        form.reset({
          vendorId: data.vendorId,
          billDate: new Date(data.billDate),
          dueDate: new Date(data.dueDate),
          currency: data.currency,
          exchangeRate: data.exchangeRate ? Number(data.exchangeRate) : undefined,
          billNumber: data.billNumber ?? "",
          lines: lineDefaults,
          notes: data.notes ?? "",
        });
        replace(lineDefaults);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load bill.");
      } finally {
        setLoading(false);
      }
    };

    loadBill();
  }, [form, billId, isNew, orgCurrency, replace]);

  const lineValues = form.watch("lines");
  const billDateValue = form.watch("billDate");
  const currencyValue = form.watch("currency") || orgCurrency;
  const showMultiCurrencyWarning = currencyValue !== orgCurrency;
  const isLocked = isDateLocked(lockDate, billDateValue);

  const lineCalculations = useMemo(() => {
    return (lineValues ?? []).map((line) => {
      const grossCents = calculateGrossCents(line.qty ?? 0, line.unitPrice ?? 0);
      const discountCents = toCents(line.discountAmount ?? 0);
      const taxCode = line.taxCodeId ? taxCodesById.get(line.taxCodeId) : undefined;
      const netCents = grossCents - discountCents;
      const lineSubTotalCents = netCents > 0n ? netCents : 0n;
      const taxCents =
        vatEnabled && taxCode?.type === "STANDARD" ? calculateTaxCents(lineSubTotalCents, taxCode.rate) : 0n;
      const lineTotalCents = lineSubTotalCents + taxCents;
      return {
        lineSubTotalCents,
        taxCents,
        lineTotalCents,
      };
    });
  }, [lineValues, taxCodesById, vatEnabled]);

  const lineIssues = useMemo(() => {
    return (lineValues ?? []).map((line) => {
      const qty = Number(line.qty ?? 0);
      const unitPrice = Number(line.unitPrice ?? 0);
      const discountAmount = Number(line.discountAmount ?? 0);
      const grossCents = calculateGrossCents(line.qty ?? 0, line.unitPrice ?? 0);
      const discountCents = toCents(line.discountAmount ?? 0);

      const qtyError =
        !Number.isFinite(qty) || qty <= 0 ? "Qty must be greater than 0." : null;
      const unitPriceError =
        !Number.isFinite(unitPrice) || unitPrice < 0 ? "Unit price must be 0 or greater." : null;

      let discountError: string | null = null;
      if (!Number.isFinite(discountAmount) || discountAmount < 0) {
        discountError = "Discount must be 0 or greater.";
      } else if (discountCents > grossCents) {
        discountError = "Discount exceeds line amount.";
      }

      const taxHint = vatEnabled && !line.taxCodeId ? "No tax code selected." : null;

      return {
        qtyError,
        unitPriceError,
        discountError,
        taxHint,
      };
    });
  }, [lineValues, vatEnabled]);

  const computedTotals = useMemo(() => {
    let subTotalCents = 0n;
    let taxTotalCents = 0n;
    let totalCents = 0n;
    for (const line of lineCalculations) {
      subTotalCents += line.lineSubTotalCents;
      taxTotalCents += line.taxCents;
      totalCents += line.lineTotalCents;
    }
    return { subTotalCents, taxTotalCents, totalCents };
  }, [lineCalculations]);

  const formatCents = (value: bigint) => formatMoney(formatBigIntDecimal(value, 2), currencyValue);
  const displaySubTotal = isReadOnly && bill ? formatMoney(bill.subTotal, currencyValue) : formatCents(computedTotals.subTotalCents);
  const displayTaxTotal = isReadOnly && bill ? formatMoney(bill.taxTotal, currencyValue) : formatCents(computedTotals.taxTotalCents);
  const displayTotal = isReadOnly && bill ? formatMoney(bill.total, currencyValue) : formatCents(computedTotals.totalCents);

  const ledgerPreview = useMemo(() => {
    if (!bill) {
      return [];
    }
    const apAccount = accounts.find((account) => account.subtype === "AP" && account.isActive);
    const vatAccount = accounts.find((account) => account.subtype === "VAT_RECEIVABLE" && account.isActive);
    const expenseTotals = new Map<string, number>();
    const taxTotals = new Map<string, number>();

    bill.lines.forEach((line) => {
      const expense = Number(line.lineSubTotal);
      expenseTotals.set(line.expenseAccountId, (expenseTotals.get(line.expenseAccountId) ?? 0) + expense);
      const lineTax = Number(line.lineTax);
      if (lineTax > 0) {
        const key = line.taxCodeId ?? "none";
        taxTotals.set(key, (taxTotals.get(key) ?? 0) + lineTax);
      }
    });

    const preview: { label: string; debit?: number; credit?: number }[] = [];
    expenseTotals.forEach((amount, accountId) => {
      const account = accounts.find((entry) => entry.id === accountId);
      if (account) {
        preview.push({ label: account.name, debit: amount });
      }
    });
    if (vatAccount) {
      taxTotals.forEach((amount) => {
        preview.push({ label: vatAccount.name, debit: amount });
      });
    }
    if (apAccount) {
      preview.push({ label: apAccount.name, credit: Number(bill.total) });
    }
    return preview;
  }, [accounts, bill]);

  const submitBill = async (values: BillCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      if (isNew) {
        const created = await apiFetch<BillRecord>("/bills", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
        toast({ title: "Bill draft created", description: "Draft saved successfully." });
        router.replace(`/bills/${created.id}`);
        return;
      }
      const updated = await apiFetch<BillRecord>(`/bills/${billId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setBill(updated);
      toast({ title: "Bill saved", description: "Draft updates saved." });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save bill", err);
    } finally {
      setSaving(false);
    }
  };

  const postBill = async () => {
    if (!bill || !canPost) {
      return;
    }
    setPostError(null);
    try {
      const result = await apiFetch<{ bill: BillRecord }>(`/bills/${bill.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setBill(result.bill);
      setPostDialogOpen(false);
      toast({ title: "Bill posted", description: "Ledger entries created." });
    } catch (err) {
      setPostError(err);
      showErrorToast("Unable to post bill", err);
    }
  };

  const voidBill = async () => {
    if (!bill || !canPost) {
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      const result = await apiFetch<{ bill: BillRecord }>(`/bills/${bill.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setBill(result.bill);
      setVoidDialogOpen(false);
      toast({ title: "Bill voided", description: "A reversal entry was created." });
    } catch (err) {
      setVoidError(err);
      showErrorToast("Unable to void bill", err);
    } finally {
      setVoiding(false);
    }
  };

  const updateLineItem = (index: number, itemId: string) => {
    const item = itemsById.get(itemId);
    if (!item) {
      return;
    }
    form.setValue(`lines.${index}.itemId`, item.id);
    form.setValue(`lines.${index}.description`, item.name);
    form.setValue(`lines.${index}.expenseAccountId`, item.expenseAccountId);
    const price = item.purchasePrice ?? 0;
    form.setValue(`lines.${index}.unitPrice`, Number(price));
    if (item.defaultTaxCodeId) {
      form.setValue(`lines.${index}.taxCodeId`, item.defaultTaxCodeId);
    }
  };

  if (loading) {
    return <div className="card">Loading bill...</div>;
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <h1>Bills</h1>
        <p className="muted">You do not have permission to create bills.</p>
        <Button variant="secondary" onClick={() => router.push("/bills")}>
          Back to bills
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && bill?.updatedAt ? formatDateTime(bill.updatedAt) : null;
  const postedAt = !isNew && bill?.postedAt ? formatDateTime(bill.postedAt) : null;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "New Bill" : bill?.systemNumber ?? bill?.billNumber ?? "Draft Bill"}</h1>
          <p className="muted">
            {isNew ? "Capture vendor bill details." : `${bill?.vendor?.name ?? "Vendor"} | ${bill?.currency ?? orgCurrency}`}
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
          <StatusChip status={bill?.status ?? "DRAFT"} />
        ) : null}
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={() => window.location.reload()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={billDateValue} actionLabel="saving or posting" />
      {showMultiCurrencyWarning ? (
        <p className="form-error">Multi-currency is not fully supported yet. Review exchange rates before posting.</p>
      ) : null}

      <form onSubmit={form.handleSubmit(submitBill)}>
        <div className="section-header">
          <div>
            <strong>Totals</strong>
            <p className="muted">Sub-total, tax, and grand total.</p>
          </div>
          <div>
            <div>Subtotal: {displaySubTotal}</div>
            <div>Tax: {displayTaxTotal}</div>
            <div>
              <strong>Total: {displayTotal}</strong>
            </div>
          </div>
        </div>
        <div style={{ height: 16 }} />
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
            Bill Date *
            <Controller
              control={form.control}
              name="billDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                />
              )}
            />
            {renderFieldError(form.formState.errors.billDate?.message)}
          </label>
          <label>
            Due Date *
            <Controller
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                />
              )}
            />
            {renderFieldError(form.formState.errors.dueDate?.message)}
          </label>
          <label>
            Currency *
            <Input disabled={isReadOnly} {...form.register("currency")} />
            {renderFieldError(form.formState.errors.currency?.message)}
          </label>
          <label>
            Vendor Bill #
            <Input disabled={isReadOnly} {...form.register("billNumber")} />
          </label>
        </div>

        <div style={{ height: 16 }} />
        <h2>Line items</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Expense Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Discount</TableHead>
              {vatEnabled ? <TableHead>Tax Code</TableHead> : null}
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const lineCalc = lineCalculations[index];
              const lineIssue = lineIssues[index];
              return (
              <TableRow key={field.id}>
                <TableCell>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.itemId`}
                    render={({ field }) => (
                      <ItemCombobox
                        value={field.value ?? ""}
                        selectedLabel={
                          field.value ? itemsById.get(field.value)?.name ?? lineValues?.[index]?.description : undefined
                        }
                        options={(() => {
                          const selectedItem = field.value ? itemsById.get(field.value) : undefined;
                          const combined = selectedItem
                            ? [
                                selectedItem,
                                ...itemSearchResults.filter((item) => item.id !== selectedItem.id),
                              ]
                            : itemSearchResults;
                          return combined.map((item) => ({ id: item.id, label: item.name }));
                        })()}
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value) {
                            updateLineItem(index, value);
                          }
                        }}
                        onSearchChange={setItemSearchTerm}
                        isLoading={itemSearchLoading}
                        disabled={isReadOnly}
                      />
                    )}
                  />
                  {renderFieldError(form.formState.errors.lines?.[index]?.itemId?.message)}
                </TableCell>
                <TableCell>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.expenseAccountId`}
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={isReadOnly}>
                        <SelectTrigger aria-label="Expense account">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(form.formState.errors.lines?.[index]?.expenseAccountId?.message)}
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
                    {...form.register(`lines.${index}.qty`, { valueAsNumber: true })}
                    className={lineIssue?.qtyError ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {lineIssue?.qtyError ? <p className="form-error">{lineIssue.qtyError}</p> : null}
                  {renderFieldError(form.formState.errors.lines?.[index]?.qty?.message)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isReadOnly}
                    {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                    className={lineIssue?.unitPriceError ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {lineIssue?.unitPriceError ? <p className="form-error">{lineIssue.unitPriceError}</p> : null}
                  {renderFieldError(form.formState.errors.lines?.[index]?.unitPrice?.message)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isReadOnly}
                    {...form.register(`lines.${index}.discountAmount`, { valueAsNumber: true })}
                    className={lineIssue?.discountError ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {lineIssue?.discountError ? <p className="form-error">{lineIssue.discountError}</p> : null}
                  {renderFieldError(form.formState.errors.lines?.[index]?.discountAmount?.message)}
                </TableCell>
                {vatEnabled ? (
                  <TableCell>
                    <Controller
                      control={form.control}
                      name={`lines.${index}.taxCodeId`}
                      render={({ field }) => (
                        <Select
                          value={field.value ? field.value : "none"}
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger aria-label="Tax code">
                            <SelectValue placeholder="Select tax code" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {activeTaxCodes.map((code) => (
                              <SelectItem key={code.id} value={code.id}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {lineIssue?.taxHint ? <p className="muted">{lineIssue.taxHint}</p> : null}
                    {renderFieldError(form.formState.errors.lines?.[index]?.taxCodeId?.message)}
                  </TableCell>
                ) : null}
                <TableCell className="text-right">{formatCents(lineCalc?.lineSubTotalCents ?? 0n)}</TableCell>
                <TableCell className="text-right">{formatCents(lineCalc?.taxCents ?? 0n)}</TableCell>
                <TableCell className="text-right">{formatCents(lineCalc?.lineTotalCents ?? 0n)}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => remove(index)}
                    disabled={isReadOnly || fields.length === 1}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>

        <div style={{ height: 12 }} />
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            append({
              expenseAccountId: "",
              itemId: "",
              description: "",
              qty: 1,
              unitPrice: 0,
              discountAmount: 0,
              taxCodeId: "",
            } as BillLineCreateInput)
          }
          disabled={isReadOnly}
        >
          Add Line
        </Button>

        <div style={{ height: 16 }} />
        <div className="form-grid">
          <label>
            Notes
            <textarea className="input" rows={3} disabled={isReadOnly} {...form.register("notes")} />
          </label>
        </div>

        <div style={{ height: 16 }} />
        <div className="section-header">
          <Button type="submit" disabled={saving || isReadOnly || isLocked}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
          {!isNew && bill?.status === "DRAFT" && canPost ? (
            <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" disabled={isLocked}>
                  Post Bill
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Post bill</DialogTitle>
                </DialogHeader>
                <p>This will post the bill and create ledger entries.</p>
                <div style={{ height: 12 }} />
                <strong>Ledger impact</strong>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerPreview.map((line, index) => (
                      <TableRow key={`${line.label}-${index}`}>
                        <TableCell>{line.label}</TableCell>
                        <TableCell>{line.debit ? formatMoney(line.debit, orgCurrency) : "-"}</TableCell>
                        <TableCell>{line.credit ? formatMoney(line.credit, orgCurrency) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {postError ? <ErrorBanner error={postError} /> : null}
                <div style={{ height: 12 }} />
                <Button type="button" onClick={() => postBill()} disabled={isLocked}>
                  Confirm Post
                </Button>
              </DialogContent>
            </Dialog>
          ) : null}
          {!isNew && bill?.status === "POSTED" && canPost ? (
            <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={isLocked || voiding}>
                  Void Bill
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Void bill</DialogTitle>
                </DialogHeader>
                <p>This will mark the bill as void and create a reversal entry.</p>
                {voidError ? <ErrorBanner error={voidError} /> : null}
                <div style={{ height: 12 }} />
                <Button type="button" variant="destructive" onClick={() => voidBill()} disabled={isLocked || voiding}>
                  {voiding ? "Voiding..." : "Confirm Void"}
                </Button>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </form>
    </div>
  );
}
