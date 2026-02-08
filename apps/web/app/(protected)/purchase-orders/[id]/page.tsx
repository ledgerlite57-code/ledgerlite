"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  Permissions,
  purchaseOrderCreateSchema,
  type PaginatedResponse,
  type PurchaseOrderCreateInput,
  type PurchaseOrderLineCreateInput,
} from "@ledgerlite/shared";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { apiBaseUrl, apiFetch, ensureAccessToken, refreshAccessToken } from "../../../../src/lib/api";
import { formatDateTime, formatMoney } from "../../../../src/lib/format";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { calculateGrossCents, calculateTaxCents, formatBigIntDecimal, toCents } from "../../../../src/lib/money";
import { ValidationSummary } from "../../../../src/lib/ui-validation-summary";

type VendorRecord = { id: string; name: string; isActive: boolean; paymentTermsDays: number };
type ItemRecord = {
  id: string;
  name: string;
  purchasePrice?: string | number | null;
  expenseAccountId?: string | null;
  inventoryAccountId?: string | null;
  fixedAssetAccountId?: string | null;
  defaultTaxCodeId?: string | null;
  unitOfMeasureId?: string | null;
  type: string;
  isActive: boolean;
};
type AccountRecord = { id: string; name: string; code?: string | null; type: string; isActive: boolean };
type TaxCodeRecord = { id: string; name: string; rate: string | number; type: string; isActive: boolean };
type PurchaseOrderLineRecord = {
  id: string;
  lineNo: number;
  expenseAccountId: string;
  itemId?: string | null;
  unitOfMeasureId?: string | null;
  description: string;
  qtyOrdered: string | number;
  qtyReceived: string | number;
  qtyBilled: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  taxCodeId?: string | null;
  lineSubTotal: string | number;
  lineTax: string | number;
  lineTotal: string | number;
};
type PurchaseOrderRecord = {
  id: string;
  systemNumber?: string | null;
  poNumber?: string | null;
  status: string;
  vendorId: string;
  poDate: string;
  expectedDeliveryDate?: string | null;
  currency: string;
  exchangeRate?: string | number | null;
  reference?: string | null;
  notes?: string | null;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  billedAmount: string | number;
  remainingAmount: string | number;
  sentAt?: string | null;
  receivedAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  vendor: { id: string; name: string };
  lines: PurchaseOrderLineRecord[];
  bills: Array<{ id: string; systemNumber?: string | null; billNumber?: string | null; status: string; total: string | number; currency: string }>;
};
type AttachmentRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  description?: string | null;
  createdAt?: string;
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

const showErrorToast = (title: string, error: unknown) => {
  const normalized = normalizeError(error);
  toast({
    variant: "destructive",
    title,
    description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
  });
};

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const poId = params?.id ?? "";
  const isNew = poId === "new";

  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderRecord | null>(null);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [attachmentForm, setAttachmentForm] = useState<{
    name: string;
    url: string;
    description: string;
    file: File | null;
  }>({
    name: "",
    url: "",
    description: "",
    file: null,
  });
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.PURCHASE_ORDER_WRITE);
  const canApprove = hasPermission(Permissions.PURCHASE_ORDER_APPROVE);

  const form = useForm<PurchaseOrderCreateInput>({
    resolver: zodResolver(purchaseOrderCreateSchema),
    defaultValues: {
      vendorId: "",
      poDate: new Date(),
      expectedDeliveryDate: undefined,
      currency: orgCurrency,
      exchangeRate: 1,
      poNumber: "",
      reference: "",
      notes: "",
      lines: [
        {
          expenseAccountId: "",
          itemId: "",
          unitOfMeasureId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          taxCodeId: "",
        },
      ],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const loadReferences = useCallback(async () => {
    try {
      const [org, vendorResult, itemResult, accountResult, taxResult] = await Promise.all([
        apiFetch<{ baseCurrency?: string; vatEnabled?: boolean }>("/orgs/current"),
        apiFetch<VendorRecord[] | PaginatedResponse<VendorRecord>>("/vendors"),
        apiFetch<ItemRecord[] | PaginatedResponse<ItemRecord>>("/items?isActive=true"),
        apiFetch<AccountRecord[]>("/accounts"),
        apiFetch<TaxCodeRecord[] | PaginatedResponse<TaxCodeRecord>>("/tax-codes").catch(() => []),
      ]);
      setOrgCurrency(org.baseCurrency ?? "AED");
      setVatEnabled(Boolean(org.vatEnabled));
      setVendors(Array.isArray(vendorResult) ? vendorResult : vendorResult.data ?? []);
      setItems(Array.isArray(itemResult) ? itemResult : itemResult.data ?? []);
      setAccounts(accountResult ?? []);
      setTaxCodes(Array.isArray(taxResult) ? taxResult : taxResult.data ?? []);
    } catch (err) {
      setActionError(err);
    }
  }, []);

  const loadPurchaseOrder = useCallback(async () => {
    if (isNew) {
      return;
    }
    const data = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}`);
    setPurchaseOrder(data);
    replace(
      data.lines.map((line) => ({
        expenseAccountId: line.expenseAccountId,
        itemId: line.itemId ?? "",
        unitOfMeasureId: line.unitOfMeasureId ?? "",
        description: line.description,
        qty: Number(line.qtyOrdered),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount ?? 0),
        taxCodeId: line.taxCodeId ?? "",
      })),
    );
    form.reset({
      vendorId: data.vendorId,
      poDate: new Date(data.poDate),
      expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
      currency: data.currency,
      exchangeRate: data.exchangeRate != null ? Number(data.exchangeRate) : 1,
      poNumber: data.poNumber ?? "",
      reference: data.reference ?? "",
      notes: data.notes ?? "",
      lines: data.lines.map((line) => ({
        expenseAccountId: line.expenseAccountId,
        itemId: line.itemId ?? "",
        unitOfMeasureId: line.unitOfMeasureId ?? "",
        description: line.description,
        qty: Number(line.qtyOrdered),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount ?? 0),
        taxCodeId: line.taxCodeId ?? "",
      })),
    });
    setReceiptQuantities(
      data.lines.reduce<Record<string, string>>((acc, line) => {
        const remaining = Math.max(0, Number(line.qtyOrdered) - Number(line.qtyReceived));
        acc[line.id] = remaining > 0 ? String(remaining) : "0";
        return acc;
      }, {}),
    );
  }, [form, isNew, poId, replace]);

  const loadAttachments = useCallback(async () => {
    if (isNew || !purchaseOrder?.id) {
      setAttachments([]);
      return;
    }
    setAttachmentsLoading(true);
    try {
      setAttachmentsError(null);
      const params = new URLSearchParams({ entityType: "PURCHASE_ORDER", entityId: purchaseOrder.id });
      const data = await apiFetch<AttachmentRecord[]>(`/attachments?${params.toString()}`);
      setAttachments(data ?? []);
    } catch (err) {
      setAttachmentsError(err instanceof Error ? err.message : "Unable to load attachments.");
    } finally {
      setAttachmentsLoading(false);
    }
  }, [isNew, purchaseOrder?.id]);

  const withAuthRetry = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    let token = await ensureAccessToken();
    const doFetch = (accessToken: string | null) =>
      fetch(input, {
        ...init,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(init?.headers ?? {}),
        },
        credentials: "include",
      });

    let response = await doFetch(token);
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      token = refreshed;
      response = await doFetch(token);
    }
    return response;
  }, []);

  const uploadAttachment = useCallback(async () => {
    if (!purchaseOrder?.id) {
      return;
    }

    const file = attachmentForm.file;
    const trimmedName = attachmentForm.name.trim();
    const trimmedUrl = attachmentForm.url.trim();
    const trimmedDescription = attachmentForm.description.trim();
    if (!file && !trimmedUrl) {
      setAttachmentsError("Select a file or provide a URL.");
      return;
    }

    setAttachmentSaving(true);
    try {
      setAttachmentsError(null);
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", "PURCHASE_ORDER");
        formData.append("entityId", purchaseOrder.id);
        if (trimmedDescription) {
          formData.append("description", trimmedDescription);
        }
        const response = await withAuthRetry(`${apiBaseUrl}/attachments/upload`, { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = payload?.error?.message ?? "Unable to upload attachment.";
          throw new Error(message);
        }
        const created = payload?.data ?? payload;
        setAttachments((prev) => [created, ...prev]);
      } else {
        const created = await apiFetch<AttachmentRecord>("/attachments", {
          method: "POST",
          body: JSON.stringify({
            entityType: "PURCHASE_ORDER",
            entityId: purchaseOrder.id,
            fileName: trimmedName || trimmedUrl.split("/").pop() || "attachment",
            mimeType: "text/uri-list",
            sizeBytes: 1,
            storageKey: trimmedUrl,
            description: trimmedDescription || undefined,
          }),
        });
        setAttachments((prev) => [created, ...prev]);
      }
      setAttachmentForm({ name: "", url: "", description: "", file: null });
    } catch (err) {
      setAttachmentsError(err instanceof Error ? err.message : "Unable to save attachment.");
    } finally {
      setAttachmentSaving(false);
    }
  }, [attachmentForm, purchaseOrder?.id, withAuthRetry]);

  const downloadAttachment = useCallback(
    async (attachment: AttachmentRecord) => {
      if (attachment.storageKey?.startsWith("http")) {
        window.open(attachment.storageKey, "_blank", "noreferrer");
        return;
      }
      try {
        const response = await withAuthRetry(`${apiBaseUrl}/attachments/${attachment.id}/download`);
        if (!response.ok) {
          throw new Error("Unable to download attachment.");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        setAttachmentsError(err instanceof Error ? err.message : "Unable to download attachment.");
      }
    },
    [withAuthRetry],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        setActionError(null);
        await loadReferences();
        if (active) {
          await loadPurchaseOrder();
        }
      } catch (err) {
        if (active) {
          setActionError(err);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [loadPurchaseOrder, loadReferences]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const lineValues = useWatch({ control: form.control, name: "lines" });
  const previewTotals = useMemo(() => {
    return (lineValues ?? []).reduce(
      (acc, line) => {
        const qty = Number(line.qty ?? 0);
        const unitPrice = Number(line.unitPrice ?? 0);
        const discount = Number(line.discountAmount ?? 0);
        const taxRate = vatEnabled
          ? Number(taxCodes.find((code) => code.id === line.taxCodeId)?.rate ?? 0)
          : 0;
        const gross = calculateGrossCents(qty, unitPrice);
        const net = gross - toCents(discount);
        const tax = calculateTaxCents(net, taxRate);
        acc.subTotal += gross;
        acc.taxTotal += tax;
        acc.total += net + tax;
        return acc;
      },
      { subTotal: 0n, taxTotal: 0n, total: 0n },
    );
  }, [lineValues, taxCodes, vatEnabled]);

  const isReadOnly = !canWrite || (!isNew && !!purchaseOrder && ["CLOSED", "CANCELLED"].includes(purchaseOrder.status));
  const isHeaderCurrencyLocked =
    !isNew &&
    !!purchaseOrder &&
    ["SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"].includes(purchaseOrder.status);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      setActionError(null);
      if (isNew) {
        const created = await apiFetch<PurchaseOrderRecord>("/purchase-orders", {
          method: "POST",
          body: JSON.stringify(values),
        });
        router.replace(`/purchase-orders/${created.id}`);
      } else {
        const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        setPurchaseOrder(updated);
      }
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to save purchase order", err);
    } finally {
      setSaving(false);
    }
  });

  const runAction = async (action: string, callback: () => Promise<void>) => {
    setActionBusy(action);
    try {
      setActionError(null);
      await callback();
    } catch (err) {
      setActionError(err);
      showErrorToast(`Unable to ${action.toLowerCase()}`, err);
    } finally {
      setActionBusy(null);
    }
  };

  const poStatus = purchaseOrder?.status ?? "DRAFT";

  if (loading) {
    return (
      <div className="card">
        <PageHeader title="Purchase Orders" heading="Purchase Order" description="Loading..." icon={<FileText className="h-5 w-5" />} />
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Purchase Orders"
        heading={isNew ? "New Purchase Order" : "Purchase Order"}
        description={isNew ? "Create a draft purchase order." : `Status: ${poStatus}`}
        icon={<FileText className="h-5 w-5" />}
        actions={!isNew ? <StatusChip status={poStatus} /> : undefined}
      />
      {actionError ? <ErrorBanner error={actionError} /> : null}
      {!isNew && purchaseOrder ? (
        <div className="muted">
          Number: {purchaseOrder.systemNumber ?? purchaseOrder.poNumber ?? "Draft"}
          {purchaseOrder.sentAt ? ` · Sent ${formatDateTime(purchaseOrder.sentAt)}` : ""}
          {purchaseOrder.receivedAt ? ` · Received ${formatDateTime(purchaseOrder.receivedAt)}` : ""}
        </div>
      ) : null}
      {form.formState.submitCount > 0 ? <ValidationSummary errors={form.formState.errors} /> : null}
      <div style={{ height: 12 }} />

      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Vendor *
          <Controller
            control={form.control}
            name="vendorId"
            render={({ field }) => (
              <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)} disabled={isReadOnly}>
                <SelectTrigger aria-label="Vendor">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select vendor</SelectItem>
                  {vendors
                    .filter((vendor) => vendor.isActive)
                    .map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
        </label>
        <label>
          PO Date *
          <Input
            type="date"
            value={formatDateInput(form.watch("poDate"))}
            disabled={isReadOnly}
            onChange={(event) => form.setValue("poDate", event.target.value ? new Date(event.target.value) : new Date())}
          />
        </label>
        <label>
          Expected Delivery
          <Input
            type="date"
            value={formatDateInput(form.watch("expectedDeliveryDate"))}
            disabled={isReadOnly}
            onChange={(event) =>
              form.setValue("expectedDeliveryDate", event.target.value ? new Date(event.target.value) : undefined)
            }
          />
        </label>
        <label>
          Currency
          <Input
            value={form.watch("currency") ?? orgCurrency}
            disabled={isReadOnly || isHeaderCurrencyLocked}
            {...form.register("currency")}
          />
        </label>
        <label>
          Exchange Rate
          <Input
            type="number"
            step="0.000001"
            min={0.000001}
            disabled={isReadOnly || isHeaderCurrencyLocked}
            {...form.register("exchangeRate", { valueAsNumber: true })}
          />
        </label>
        <label>
          PO Number
          <Input disabled={isReadOnly} {...form.register("poNumber")} />
        </label>
        <label>
          Reference
          <Input disabled={isReadOnly} {...form.register("reference")} />
        </label>

        <div className="section-header" style={{ gridColumn: "1 / -1" }}>
          <strong>Lines</strong>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              append({
                expenseAccountId: "",
                itemId: "",
                unitOfMeasureId: "",
                description: "",
                qty: 1,
                unitPrice: 0,
                discountAmount: 0,
                taxCodeId: "",
              } as PurchaseOrderLineCreateInput)
            }
            disabled={isReadOnly}
          >
            Add Line
          </Button>
        </div>
        <div style={{ gridColumn: "1 / -1", maxWidth: "100%" }}>
          <Table className="line-items-grid">
            <TableHeader>
              <TableRow>
                <TableHead className="col-item">Item</TableHead>
                <TableHead className="col-description">Description</TableHead>
                <TableHead className="col-account">Account</TableHead>
                <TableHead className="col-qty text-right">Qty</TableHead>
                <TableHead className="col-rate text-right">Unit Price</TableHead>
                <TableHead className="col-tax">Tax</TableHead>
                <TableHead className="col-discount text-right">Discount</TableHead>
                <TableHead className="col-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell className="col-item" data-label="Item">
                    <Controller
                      control={form.control}
                      name={`lines.${index}.itemId`}
                      render={({ field: itemField }) => (
                        <Select
                          value={itemField.value ? itemField.value : "none"}
                          onValueChange={(value) => {
                            const nextId = value === "none" ? "" : value;
                            itemField.onChange(nextId);
                            const item = items.find((row) => row.id === nextId);
                            if (!item) {
                              return;
                            }
                            form.setValue(`lines.${index}.description`, item.name);
                            form.setValue(`lines.${index}.unitPrice`, Number(item.purchasePrice ?? 0));
                            form.setValue(`lines.${index}.expenseAccountId`, item.expenseAccountId ?? item.inventoryAccountId ?? item.fixedAssetAccountId ?? "");
                            form.setValue(`lines.${index}.unitOfMeasureId`, item.unitOfMeasureId ?? "");
                            form.setValue(`lines.${index}.taxCodeId`, item.defaultTaxCodeId ?? "");
                          }}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger aria-label="Item">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No item</SelectItem>
                            {items
                              .filter((item) => item.isActive)
                              .map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </TableCell>
                  <TableCell className="col-description" data-label="Description">
                    <Input disabled={isReadOnly} {...form.register(`lines.${index}.description`)} />
                  </TableCell>
                  <TableCell className="col-account" data-label="Account">
                    <Controller
                      control={form.control}
                      name={`lines.${index}.expenseAccountId`}
                      render={({ field: accountField }) => (
                        <Select
                          value={accountField.value ? accountField.value : "none"}
                          onValueChange={(value) => accountField.onChange(value === "none" ? "" : value)}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger aria-label="Expense account">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select account</SelectItem>
                            {accounts
                              .filter((account) => account.isActive && ["EXPENSE", "ASSET"].includes(account.type))
                              .map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </TableCell>
                  <TableCell className="col-qty" data-label="Qty">
                    <Input type="number" step="0.0001" min={0} disabled={isReadOnly} {...form.register(`lines.${index}.qty`, { valueAsNumber: true })} />
                  </TableCell>
                  <TableCell className="col-rate" data-label="Unit Price">
                    <Input type="number" step="0.01" min={0} disabled={isReadOnly} {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })} />
                  </TableCell>
                  <TableCell className="col-tax" data-label="Tax">
                    <Controller
                      control={form.control}
                      name={`lines.${index}.taxCodeId`}
                      render={({ field: taxField }) => (
                        <Select
                          value={taxField.value ? taxField.value : "none"}
                          onValueChange={(value) => taxField.onChange(value === "none" ? "" : value)}
                          disabled={isReadOnly || !vatEnabled}
                        >
                          <SelectTrigger aria-label="Tax code">
                            <SelectValue placeholder="Tax code" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {taxCodes
                              .filter((tax) => tax.isActive)
                              .map((tax) => (
                                <SelectItem key={tax.id} value={tax.id}>
                                  {tax.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </TableCell>
                  <TableCell className="col-discount" data-label="Discount">
                    <Input type="number" step="0.01" min={0} disabled={isReadOnly} {...form.register(`lines.${index}.discountAmount`, { valueAsNumber: true })} />
                  </TableCell>
                  <TableCell className="col-actions" data-label="Actions">
                    <Button type="button" variant="ghost" size="sm" disabled={isReadOnly || fields.length <= 1} onClick={() => remove(index)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <label>
          Notes
          <textarea className="input" rows={3} disabled={isReadOnly} {...form.register("notes")} />
        </label>

        <div className="section-header">
          <div>
            <strong>Totals</strong>
            <p className="muted">
              Subtotal {formatMoney(formatBigIntDecimal(previewTotals.subTotal, 2), form.watch("currency") ?? orgCurrency)} · Tax{" "}
              {formatMoney(formatBigIntDecimal(previewTotals.taxTotal, 2), form.watch("currency") ?? orgCurrency)} · Total{" "}
              {formatMoney(formatBigIntDecimal(previewTotals.total, 2), form.watch("currency") ?? orgCurrency)}
            </p>
          </div>
        </div>

        <div className="form-action-bar" style={{ gridColumn: "1 / -1" }}>
          <Button type="submit" disabled={isReadOnly || saving}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save"}
          </Button>
          {!isNew && purchaseOrder?.status === "DRAFT" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy === "request approval" || !canWrite}
              onClick={() =>
                runAction("request approval", async () => {
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/request-approval`, {
                    method: "POST",
                  });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "request approval" ? "Submitting..." : "Request Approval"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder && ["DRAFT", "APPROVED"].includes(purchaseOrder.status) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy === "send" || !canWrite}
              onClick={() =>
                runAction("send", async () => {
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/send`, { method: "POST" });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "send" ? "Sending..." : "Send PO"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder?.status === "PENDING_APPROVAL" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy === "approve" || !canApprove}
              onClick={() =>
                runAction("approve", async () => {
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/approve`, {
                    method: "POST",
                  });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "approve" ? "Approving..." : "Approve"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder?.status === "PENDING_APPROVAL" ? (
            <Button
              type="button"
              variant="destructive"
              disabled={actionBusy === "reject" || !canApprove}
              onClick={() =>
                runAction("reject", async () => {
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/reject`, {
                    method: "POST",
                    body: JSON.stringify({}),
                  });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "reject" ? "Rejecting..." : "Reject"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder && !["CLOSED", "CANCELLED"].includes(purchaseOrder.status) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy === "convert" || !canWrite}
              onClick={() =>
                runAction("convert", async () => {
                  const response = await apiFetch<{ bill: { id: string } }>(`/purchase-orders/${poId}/convert-to-bill`, {
                    method: "POST",
                    body: JSON.stringify({
                      billDate: new Date(),
                      basis: "RECEIVED",
                    }),
                  });
                  if (response?.bill?.id) {
                    router.push(`/bills/${response.bill.id}`);
                  }
                })
              }
            >
              {actionBusy === "convert" ? "Converting..." : "Convert to Bill"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder && !["CLOSED", "CANCELLED"].includes(purchaseOrder.status) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy === "receive" || !canWrite}
              onClick={() =>
                runAction("receive", async () => {
                  const lines = purchaseOrder.lines
                    .map((line) => ({ lineId: line.id, qty: Number(receiptQuantities[line.id] ?? 0) }))
                    .filter((line) => line.qty > 0);
                  if (lines.length === 0) {
                    throw new Error("Enter at least one receipt quantity.");
                  }
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/receive`, {
                    method: "POST",
                    body: JSON.stringify({ receiptDate: new Date(), lines }),
                  });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "receive" ? "Receiving..." : "Receive Items"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder && !["CLOSED", "CANCELLED"].includes(purchaseOrder.status) ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy === "close" || !canWrite}
              onClick={() =>
                runAction("close", async () => {
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/close`, { method: "POST" });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "close" ? "Closing..." : "Close"}
            </Button>
          ) : null}
          {!isNew && purchaseOrder && purchaseOrder.status !== "CANCELLED" ? (
            <Button
              type="button"
              variant="destructive"
              disabled={actionBusy === "cancel" || !canWrite}
              onClick={() =>
                runAction("cancel", async () => {
                  const updated = await apiFetch<PurchaseOrderRecord>(`/purchase-orders/${poId}/cancel`, { method: "POST" });
                  setPurchaseOrder(updated);
                })
              }
            >
              {actionBusy === "cancel" ? "Cancelling..." : "Cancel"}
            </Button>
          ) : null}
        </div>
      </form>

      {!isNew && purchaseOrder ? (
        <>
          <div style={{ height: 16 }} />
          <div className="section-header">
            <strong>Receipt Entry</strong>
            <p className="muted">Enter quantities to receive, then click &quot;Receive Items&quot;.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Billed</TableHead>
                <TableHead>Receive Now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrder.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell>{Number(line.qtyOrdered)}</TableCell>
                  <TableCell>{Number(line.qtyReceived)}</TableCell>
                  <TableCell>{Number(line.qtyBilled)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      disabled={isReadOnly}
                      value={receiptQuantities[line.id] ?? ""}
                      onChange={(event) => setReceiptQuantities((prev) => ({ ...prev, [line.id]: event.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div style={{ height: 16 }} />
          <div className="section-header">
            <strong>Linked Bills</strong>
            <p className="muted">
              Billed {formatMoney(purchaseOrder.billedAmount, purchaseOrder.currency)} · Remaining{" "}
              {formatMoney(purchaseOrder.remainingAmount, purchaseOrder.currency)}
            </p>
          </div>
          {purchaseOrder.bills.length === 0 ? (
            <p className="muted">No linked bills yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrder.bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell>{bill.systemNumber ?? bill.billNumber ?? "Draft"}</TableCell>
                    <TableCell>
                      <StatusChip status={bill.status} />
                    </TableCell>
                    <TableCell>{formatMoney(bill.total, bill.currency)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="sm" onClick={() => router.push(`/bills/${bill.id}`)}>
                        View Bill
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div style={{ height: 16 }} />
          <div className="section-header">
            <strong>Attachments</strong>
          </div>
          <div className="form-grid">
            <label>
              File Name (optional for URL)
              <Input
                value={attachmentForm.name}
                disabled={isReadOnly}
                onChange={(event) => setAttachmentForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              Upload File
              <Input
                type="file"
                disabled={isReadOnly}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({
                    ...prev,
                    file: event.target.files?.[0] ?? null,
                    url: event.target.files?.[0] ? "" : prev.url,
                  }))
                }
              />
            </label>
            <label>
              Or URL
              <Input
                value={attachmentForm.url}
                disabled={isReadOnly}
                onChange={(event) =>
                  setAttachmentForm((prev) => ({
                    ...prev,
                    url: event.target.value,
                    file: event.target.value ? null : prev.file,
                  }))
                }
              />
            </label>
            <label>
              Description
              <Input
                value={attachmentForm.description}
                disabled={isReadOnly}
                onChange={(event) => setAttachmentForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <div className="section-header" style={{ gridColumn: "1 / -1", justifyContent: "flex-start" }}>
              <Button type="button" disabled={isReadOnly || attachmentSaving} onClick={uploadAttachment}>
                {attachmentSaving ? "Saving..." : "Add Attachment"}
              </Button>
            </div>
          </div>
          {attachmentsError ? <p className="form-error">{attachmentsError}</p> : null}
          {attachmentsLoading ? <p className="muted">Loading attachments...</p> : null}
          {!attachmentsLoading && attachments.length === 0 ? <p className="muted">No attachments yet.</p> : null}
          {attachments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.map((attachment) => (
                  <TableRow key={attachment.id}>
                    <TableCell>{attachment.fileName}</TableCell>
                    <TableCell>{attachment.description || "-"}</TableCell>
                    <TableCell>{attachment.createdAt ? formatDateTime(attachment.createdAt) : "-"}</TableCell>
                    <TableCell>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void downloadAttachment(attachment)}>
                          Download
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isReadOnly}
                          onClick={async () => {
                            try {
                              await apiFetch(`/attachments/${attachment.id}`, { method: "DELETE" });
                              setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
                            } catch (err) {
                              setAttachmentsError(err instanceof Error ? err.message : "Unable to delete attachment.");
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

