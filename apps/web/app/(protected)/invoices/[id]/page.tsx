"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceCreateSchema, type InvoiceCreateInput, type InvoiceLineCreateInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";

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
  lines: InvoiceLineRecord[];
  customer: { id: string; name: string };
};

const formatMoney = (value: string | number, currency: string) => {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);

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

  const isReadOnly = !isNew && invoice?.status !== "DRAFT";

  useEffect(() => {
    const loadReferenceData = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const [org, customerData, itemData, taxData, accountData] = await Promise.all([
          apiFetch<{ baseCurrency?: string; vatEnabled?: boolean }>("/orgs/current"),
          apiFetch<CustomerRecord[]>("/customers"),
          apiFetch<ItemRecord[]>("/items"),
          apiFetch<TaxCodeRecord[]>("/tax-codes").catch(() => []),
          apiFetch<AccountRecord[]>("/accounts").catch(() => []),
        ]);
        setOrgCurrency(org.baseCurrency ?? "AED");
        setVatEnabled(Boolean(org.vatEnabled));
        setCustomers(customerData);
        setItems(itemData);
        setTaxCodes(taxData);
        setAccounts(accountData);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load invoice references.");
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
        setActionError(err instanceof Error ? err.message : "Unable to load invoice.");
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
  }, [form, invoiceId, isNew, orgCurrency, replace]);

  const lineValues = form.watch("lines");
  const currencyValue = form.watch("currency") ?? orgCurrency;

  const computedTotals = useMemo(() => {
    let subTotal = 0;
    let taxTotal = 0;
    for (const line of lineValues ?? []) {
      const qty = Number(line.qty ?? 0);
      const unitPrice = Number(line.unitPrice ?? 0);
      const discount = Number(line.discountAmount ?? 0);
      const gross = qty * unitPrice;
      const lineSubTotal = Math.max(0, gross - discount);
      const taxCode = line.taxCodeId ? taxCodesById.get(line.taxCodeId) : undefined;
      const rate = vatEnabled && taxCode?.type === "STANDARD" ? Number(taxCode.rate) : 0;
      const lineTax = rate > 0 ? roundMoney((lineSubTotal * rate) / 100) : 0;
      subTotal = roundMoney(subTotal + lineSubTotal);
      taxTotal = roundMoney(taxTotal + lineTax);
    }
    const total = roundMoney(subTotal + taxTotal);
    return { subTotal, taxTotal, total };
  }, [lineValues, taxCodesById, vatEnabled]);

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
        router.replace(`/invoices/${created.id}`);
        return;
      }
      const updated = await apiFetch<InvoiceRecord>(`/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setInvoice(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save invoice.");
    } finally {
      setSaving(false);
    }
  };

  const postInvoice = async () => {
    if (!invoice) {
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
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Unable to post invoice.");
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

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "New Invoice" : invoice?.number ?? "Draft Invoice"}</h1>
          <p className="muted">
            {invoice?.status ? `Status: ${invoice.status}` : "Capture customer invoice details."}
          </p>
        </div>
        {!isNew ? (
          <span className={`status-badge ${invoice?.status?.toLowerCase() ?? "draft"}`}>{invoice?.status ?? "DRAFT"}</span>
        ) : null}
      </div>

      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}

      <form onSubmit={form.handleSubmit(submitInvoice)}>
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
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
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
            ))}
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
          <div>
            <strong>Totals</strong>
            <p className="muted">Sub-total, tax, and grand total.</p>
          </div>
          <div>
            <div>
              Subtotal: {formatMoney(isReadOnly && invoice ? invoice.subTotal : computedTotals.subTotal, currencyValue)}
            </div>
            <div>Tax: {formatMoney(isReadOnly && invoice ? invoice.taxTotal : computedTotals.taxTotal, currencyValue)}</div>
            <div>
              <strong>Total: {formatMoney(isReadOnly && invoice ? invoice.total : computedTotals.total, currencyValue)}</strong>
            </div>
          </div>
        </div>

        <div style={{ height: 16 }} />
        <div className="section-header">
          <Button type="submit" disabled={saving || isReadOnly}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
          {!isNew && invoice?.status === "DRAFT" ? (
            <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" type="button">
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
                {postError ? <p className="form-error">{postError}</p> : null}
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
