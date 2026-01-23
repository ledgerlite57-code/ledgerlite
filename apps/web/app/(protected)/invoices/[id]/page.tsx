"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  invoiceCreateSchema,
  Permissions,
  type InvoiceCreateInput,
  type InvoiceLineCreateInput,
  type PaginatedResponse,
} from "@ledgerlite/shared";
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

type CustomerRecord = { id: string; name: string; isActive: boolean };
type ItemRecord = {
  id: string;
  name: string;
  salePrice: string | number;
  incomeAccountId: string;
  defaultTaxCodeId?: string | null;
  isActive: boolean;
};
type TaxCodeRecord = { id: string; name: string; rate: string | number; type: string; isActive: boolean };
type AccountRecord = { id: string; name: string; subtype?: string | null; type: string; isActive: boolean };
type InvoiceLineRecord = {
  id: string;
  itemId?: string | null;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  taxCodeId?: string | null;
  lineSubTotal: string | number;
  lineTax: string | number;
  lineTotal: string | number;
};
type InvoiceRecord = {
  id: string;
  number?: string | null;
  status: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  exchangeRate?: string | number | null;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  notes?: string | null;
  terms?: string | null;
  updatedAt?: string;
  postedAt?: string | null;
  lines: InvoiceLineRecord[];
  customer: { id: string; name: string };
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

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params?.id ?? "";
  const isNew = invoiceId === "new";

  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postError, setPostError] = useState<unknown>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.INVOICE_WRITE);
  const canPost = hasPermission(Permissions.INVOICE_POST);

  const form = useForm<InvoiceCreateInput>({
    resolver: zodResolver(invoiceCreateSchema),
    defaultValues: {
      customerId: "",
      invoiceDate: new Date(),
      dueDate: new Date(),
      currency: orgCurrency,
      lines: [
        {
          itemId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          taxCodeId: "",
        },
      ],
      notes: "",
      terms: "",
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const activeItems = useMemo(() => items.filter((item) => item.isActive), [items]);
  const activeTaxCodes = useMemo(() => taxCodes.filter((code) => code.isActive), [taxCodes]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxCodesById = useMemo(() => new Map(taxCodes.map((code) => [code.id, code])), [taxCodes]);

  const isReadOnly = !canWrite || (!isNew && invoice?.status !== "DRAFT");

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
          const [org, customerData, itemData, taxData, accountData] = await Promise.all([
            apiFetch<{ baseCurrency?: string; vatEnabled?: boolean }>("/orgs/current"),
            apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
            apiFetch<ItemRecord[]>("/items"),
            apiFetch<TaxCodeRecord[]>("/tax-codes").catch(() => []),
            apiFetch<AccountRecord[]>("/accounts").catch(() => []),
          ]);
          setOrgCurrency(org.baseCurrency ?? "AED");
          setVatEnabled(Boolean(org.vatEnabled));
          setCustomers(customerData.data);
        setItems(itemData);
        setTaxCodes(taxData);
        setAccounts(accountData);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load invoice references.");
      } finally {
        setLoading(false);
      }
    };

    loadReferenceData();
  }, []);

  useEffect(() => {
    if (isNew) {
      form.reset({
        customerId: "",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currency: orgCurrency,
        lines: [
          {
            itemId: "",
            description: "",
            qty: 1,
            unitPrice: 0,
            discountAmount: 0,
            taxCodeId: "",
          },
        ],
        notes: "",
        terms: "",
      });
      replace([
        {
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

    const loadInvoice = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<InvoiceRecord>(`/invoices/${invoiceId}`);
        setInvoice(data);
        const lineDefaults = data.lines.map((line) => ({
          itemId: line.itemId ?? "",
          description: line.description ?? "",
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
          discountAmount: Number(line.discountAmount ?? 0),
          taxCodeId: line.taxCodeId ?? "",
        }));
        form.reset({
          customerId: data.customerId,
          invoiceDate: new Date(data.invoiceDate),
          dueDate: new Date(data.dueDate),
          currency: data.currency,
          exchangeRate: data.exchangeRate ? Number(data.exchangeRate) : undefined,
          lines: lineDefaults,
          notes: data.notes ?? "",
          terms: data.terms ?? "",
        });
        replace(lineDefaults);
      } catch (err) {
        setActionError(err instanceof Error ? err : "Unable to load invoice.");
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
  }, [form, invoiceId, isNew, orgCurrency, replace]);

  const lineValues = form.watch("lines");
  const currencyValue = form.watch("currency") ?? orgCurrency;
  const showMultiCurrencyWarning = currencyValue !== orgCurrency;

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
  const displaySubTotal = isReadOnly && invoice ? formatMoney(invoice.subTotal, currencyValue) : formatCents(computedTotals.subTotalCents);
  const displayTaxTotal = isReadOnly && invoice ? formatMoney(invoice.taxTotal, currencyValue) : formatCents(computedTotals.taxTotalCents);
  const displayTotal = isReadOnly && invoice ? formatMoney(invoice.total, currencyValue) : formatCents(computedTotals.totalCents);

  const ledgerPreview = useMemo(() => {
    if (!invoice) {
      return [];
    }
    const arAccount = accounts.find((account) => account.subtype === "AR" && account.isActive);
    const vatAccount = accounts.find((account) => account.subtype === "VAT_PAYABLE" && account.isActive);
    const revenueTotals = new Map<string, number>();
    const taxTotals = new Map<string, number>();

    invoice.lines.forEach((line) => {
      if (!line.itemId) {
        return;
      }
      const item = itemsById.get(line.itemId);
      if (!item) {
        return;
      }
      const revenue = Number(line.lineSubTotal);
      revenueTotals.set(item.incomeAccountId, (revenueTotals.get(item.incomeAccountId) ?? 0) + revenue);
      const lineTax = Number(line.lineTax);
      if (lineTax > 0) {
        const key = line.taxCodeId ?? "none";
        taxTotals.set(key, (taxTotals.get(key) ?? 0) + lineTax);
      }
    });

    const preview: { label: string; debit?: number; credit?: number }[] = [];
    if (arAccount) {
      preview.push({ label: arAccount.name, debit: Number(invoice.total) });
    }
    revenueTotals.forEach((amount, accountId) => {
      const account = accounts.find((entry) => entry.id === accountId);
      if (account) {
        preview.push({ label: account.name, credit: amount });
      }
    });
    if (vatAccount) {
      taxTotals.forEach((amount) => {
        preview.push({ label: vatAccount.name, credit: amount });
      });
    }
    return preview;
  }, [accounts, invoice, itemsById]);

  const submitInvoice = async (values: InvoiceCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      if (isNew) {
        const created = await apiFetch<InvoiceRecord>("/invoices", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
        toast({ title: "Invoice draft created", description: "Draft saved successfully." });
        router.replace(`/invoices/${created.id}`);
        return;
      }
      const updated = await apiFetch<InvoiceRecord>(`/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setInvoice(updated);
      toast({ title: "Invoice saved", description: "Draft updates saved." });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save invoice", err);
    } finally {
      setSaving(false);
    }
  };

  const postInvoice = async () => {
    if (!invoice || !canPost) {
      return;
    }
    setPostError(null);
    try {
      const result = await apiFetch<{ invoice: InvoiceRecord }>(`/invoices/${invoice.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setInvoice(result.invoice);
      setPostDialogOpen(false);
      toast({ title: "Invoice posted", description: "Ledger entries created." });
    } catch (err) {
      setPostError(err);
      showErrorToast("Unable to post invoice", err);
    }
  };

  const updateLineItem = (index: number, itemId: string) => {
    const item = itemsById.get(itemId);
    if (!item) {
      return;
    }
    form.setValue(`lines.${index}.itemId`, item.id);
    form.setValue(`lines.${index}.description`, item.name);
    form.setValue(`lines.${index}.unitPrice`, Number(item.salePrice));
    if (item.defaultTaxCodeId) {
      form.setValue(`lines.${index}.taxCodeId`, item.defaultTaxCodeId);
    }
  };

  if (loading) {
    return <div className="card">Loading invoice...</div>;
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <h1>Invoices</h1>
        <p className="muted">You do not have permission to create invoices.</p>
        <Button variant="secondary" onClick={() => router.push("/invoices")}>
          Back to invoices
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && invoice?.updatedAt ? formatDateTime(invoice.updatedAt) : null;
  const postedAt = !isNew && invoice?.postedAt ? formatDateTime(invoice.postedAt) : null;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "New Invoice" : invoice?.number ?? "Draft Invoice"}</h1>
          <p className="muted">
            {isNew
              ? "Capture customer invoice details."
              : `${invoice?.customer?.name ?? "Customer"} | ${invoice?.currency ?? orgCurrency}`}
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
          <StatusChip status={invoice?.status ?? "DRAFT"} />
        ) : null}
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={() => window.location.reload()} /> : null}
      {showMultiCurrencyWarning ? (
        <p className="form-error">Multi-currency is not fully supported yet. Review exchange rates before posting.</p>
      ) : null}

      <form onSubmit={form.handleSubmit(submitInvoice)}>
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
            Invoice Date *
            <Controller
              control={form.control}
              name="invoiceDate"
              render={({ field }) => (
                <Input
                  type="date"
                  disabled={isReadOnly}
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                />
              )}
            />
            {renderFieldError(form.formState.errors.invoiceDate?.message)}
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
        </div>

        <div style={{ height: 16 }} />
        <h2>Line items</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
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
              return (
              <TableRow key={field.id}>
                <TableCell>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.itemId`}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(value) => {
                          field.onChange(value);
                          updateLineItem(index, value);
                        }}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger aria-label="Item">
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(form.formState.errors.lines?.[index]?.itemId?.message)}
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
                  />
                  {renderFieldError(form.formState.errors.lines?.[index]?.qty?.message)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isReadOnly}
                    {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                  />
                  {renderFieldError(form.formState.errors.lines?.[index]?.unitPrice?.message)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={isReadOnly}
                    {...form.register(`lines.${index}.discountAmount`, { valueAsNumber: true })}
                  />
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
              itemId: "",
              description: "",
              qty: 1,
              unitPrice: 0,
              discountAmount: 0,
              taxCodeId: "",
            } as InvoiceLineCreateInput)
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
          <label>
            Terms
            <textarea className="input" rows={3} disabled={isReadOnly} {...form.register("terms")} />
          </label>
        </div>

        <div style={{ height: 16 }} />
        <div className="section-header">
          <Button type="submit" disabled={saving || isReadOnly}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
          {!isNew && invoice?.status === "DRAFT" && canPost ? (
            <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  Post Invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Post invoice</DialogTitle>
                </DialogHeader>
                <p>This will post the invoice and create ledger entries.</p>
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
                <Button type="button" onClick={() => postInvoice()}>
                  Confirm Post
                </Button>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </form>
    </div>
  );
}
