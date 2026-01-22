"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { billCreateSchema, Permissions, type BillCreateInput, type BillLineCreateInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

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
  lines: BillLineRecord[];
  vendor: { id: string; name: string };
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

export default function BillDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const billId = params?.id ?? "";
  const isNew = billId === "new";

  const [bill, setBill] = useState<BillRecord | null>(null);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
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
  const activeItems = useMemo(() => items.filter((item) => item.isActive), [items]);
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
        const [org, vendorData, itemData, taxData, accountData] = await Promise.all([
          apiFetch<{ baseCurrency?: string; vatEnabled?: boolean }>("/orgs/current"),
          apiFetch<VendorRecord[]>("/vendors"),
          apiFetch<ItemRecord[]>("/items"),
          apiFetch<TaxCodeRecord[]>("/tax-codes").catch(() => []),
          apiFetch<AccountRecord[]>("/accounts").catch(() => []),
        ]);
        setOrgCurrency(org.baseCurrency ?? "AED");
        setVatEnabled(Boolean(org.vatEnabled));
        setVendors(vendorData);
        setItems(itemData);
        setTaxCodes(taxData);
        setAccounts(accountData);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load bill references.");
      } finally {
        setLoading(false);
      }
    };

    loadReferenceData();
  }, []);

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
        setActionError(err instanceof Error ? err.message : "Unable to load bill.");
      } finally {
        setLoading(false);
      }
    };

    loadBill();
  }, [form, billId, isNew, orgCurrency, replace]);

  const lineValues = form.watch("lines");
  const currencyValue = form.watch("currency") || orgCurrency;

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
        router.replace(`/bills/${created.id}`);
        return;
      }
      const updated = await apiFetch<BillRecord>(`/bills/${billId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setBill(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save bill.");
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
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Unable to post bill.");
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

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>{isNew ? "New Bill" : bill?.systemNumber ?? bill?.billNumber ?? "Draft Bill"}</h1>
          <p className="muted">
            {bill?.status ? `Status: ${bill.status}` : "Capture vendor bill details."}
          </p>
        </div>
        {!isNew ? (
          <span className={`status-badge ${bill?.status?.toLowerCase() ?? "draft"}`}>{bill?.status ?? "DRAFT"}</span>
        ) : null}
      </div>

      {actionError ? <p className="form-error">{actionError}</p> : null}

      <form onSubmit={form.handleSubmit(submitBill)}>
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
                          if (value) {
                            updateLineItem(index, value);
                          }
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
          <div>
            <strong>Totals</strong>
            <p className="muted">Sub-total, tax, and grand total.</p>
          </div>
          <div>
            <div>Subtotal: {formatMoney(isReadOnly && bill ? bill.subTotal : computedTotals.subTotal, currencyValue)}</div>
            <div>Tax: {formatMoney(isReadOnly && bill ? bill.taxTotal : computedTotals.taxTotal, currencyValue)}</div>
            <div>
              <strong>Total: {formatMoney(isReadOnly && bill ? bill.total : computedTotals.total, currencyValue)}</strong>
            </div>
          </div>
        </div>

        <div style={{ height: 16 }} />
        <div className="section-header">
          <Button type="submit" disabled={saving || isReadOnly}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
          {!isNew && bill?.status === "DRAFT" && canPost ? (
            <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button">
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
                {postError ? <p className="form-error">{postError}</p> : null}
                <div style={{ height: 12 }} />
                <Button type="button" onClick={() => postBill()}>
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
