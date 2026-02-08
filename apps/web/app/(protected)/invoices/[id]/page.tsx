"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  invoiceCreateSchema,
  Permissions,
  type CreditNoteCreateInput,
  type InvoiceCreateInput,
  type InvoiceLineCreateInput,
  type ItemCreateInput,
  type PaginatedResponse,
} from "@ledgerlite/shared";
import { apiBaseUrl, apiFetch, ensureAccessToken, refreshAccessToken } from "../../../../src/lib/api";
import { formatDateTime, formatMoney } from "../../../../src/lib/format";
import { calculateGrossCents, calculateTaxCents, formatBigIntDecimal, toCents } from "../../../../src/lib/money";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { EditableCell, LineItemDetails, LineItemRowActions } from "../../../../src/lib/ui-line-items-grid";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { PostImpactSummary } from "../../../../src/lib/ui-post-impact-summary";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { ItemCombobox } from "../../../../src/lib/ui-item-combobox";
import { ItemQuickCreateDialog, type ItemQuickCreateRecord } from "../../../../src/lib/ui-item-quick-create";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";
import { useUiMode } from "../../../../src/lib/use-ui-mode";
import { ValidationSummary } from "../../../../src/lib/ui-validation-summary";
import { renderInlineFieldError } from "../../../../src/lib/validation-hints";

type CustomerRecord = { id: string; name: string; isActive: boolean };
type ItemRecord = {
  id: string;
  name: string;
  sku?: string | null;
  type: string;
  salePrice: string | number;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  inventoryAccountId?: string | null;
  fixedAssetAccountId?: string | null;
  unitOfMeasureId?: string | null;
  defaultTaxCodeId?: string | null;
  isActive: boolean;
};
type UnitOfMeasureRecord = {
  id: string;
  name: string;
  symbol: string;
  baseUnitId?: string | null;
  conversionRate?: string | number | null;
  isActive: boolean;
};
type TaxCodeRecord = { id: string; name: string; rate: string | number; type: string; isActive: boolean };
type AccountRecord = { id: string; name: string; subtype?: string | null; type: string; isActive: boolean };
type InvoiceLineRecord = {
  id: string;
  itemId?: string | null;
  incomeAccountId?: string | null;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  unitOfMeasureId?: string | null;
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
  reference?: string | null;
  notes?: string | null;
  terms?: string | null;
  updatedAt?: string;
  postedAt?: string | null;
  lines: InvoiceLineRecord[];
  customer: { id: string; name: string };
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

type NegativeStockPolicy = "ALLOW" | "WARN" | "BLOCK";
type NegativeStockWarningItem = {
  itemId: string;
  onHandQty: string;
  issueQty: string;
  projectedQty: string;
};
type NegativeStockWarning = {
  policy: NegativeStockPolicy;
  overrideApplied?: boolean;
  overrideReason?: string | null;
  items: NegativeStockWarningItem[];
};
type InvoicePostResponse = {
  invoice: InvoiceRecord;
  warnings?: {
    negativeStock?: NegativeStockWarning;
  };
};

type LineGridField = "item" | "qty" | "unit" | "rate";

const isNegativeStockPolicy = (value: unknown): value is NegativeStockPolicy =>
  value === "ALLOW" || value === "WARN" || value === "BLOCK";

const parseNegativeStockWarning = (value: unknown): NegativeStockWarning | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const details = value as {
    policy?: unknown;
    overrideApplied?: unknown;
    overrideReason?: unknown;
    items?: unknown;
  };
  if (!isNegativeStockPolicy(details.policy)) {
    return null;
  }
  if (!Array.isArray(details.items)) {
    return null;
  }
  const items = details.items
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => ({
      itemId: typeof entry.itemId === "string" ? entry.itemId : "",
      onHandQty: typeof entry.onHandQty === "string" ? entry.onHandQty : "0",
      issueQty: typeof entry.issueQty === "string" ? entry.issueQty : "0",
      projectedQty: typeof entry.projectedQty === "string" ? entry.projectedQty : "0",
    }))
    .filter((entry) => entry.itemId.length > 0);
  if (items.length === 0) {
    return null;
  }
  return {
    policy: details.policy,
    overrideApplied: details.overrideApplied === true,
    overrideReason: typeof details.overrideReason === "string" ? details.overrideReason : undefined,
    items,
  };
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
const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) {
    return "-";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};

const renderFieldError = (message?: string, hint?: string) => renderInlineFieldError({ message, hint });
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
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [itemSearchResults, setItemSearchResults] = useState<ItemRecord[]>([]);
  const [itemSearchLoading, setItemSearchLoading] = useState(false);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<UnitOfMeasureRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [negativeStockPolicy, setNegativeStockPolicy] = useState<NegativeStockPolicy>("ALLOW");
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postError, setPostError] = useState<unknown>(null);
  const [posting, setPosting] = useState(false);
  const [negativeStockOverrideReason, setNegativeStockOverrideReason] = useState("");
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [voidError, setVoidError] = useState<unknown>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [creatingCreditNote, setCreatingCreditNote] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [createItemName, setCreateItemName] = useState<string | undefined>();
  const [createItemTargetIndex, setCreateItemTargetIndex] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; field: LineGridField } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentForm, setAttachmentForm] = useState({
    name: "",
    url: "",
    description: "",
    file: null as File | null,
  });
  const { hasPermission } = usePermissions();
  const { isAccountant } = useUiMode();
  const canWrite = hasPermission(Permissions.INVOICE_WRITE);
  const canPost = hasPermission(Permissions.INVOICE_POST);
  const canOverrideNegativeStock = hasPermission(Permissions.INVENTORY_NEGATIVE_STOCK_OVERRIDE);
  const allowedCategories = useMemo<ItemCreateInput["type"][]>(() => ["SERVICE", "INVENTORY"], []);

  const form = useForm<InvoiceCreateInput>({
    resolver: zodResolver(invoiceCreateSchema),
    defaultValues: {
      customerId: "",
      invoiceDate: new Date(),
      dueDate: new Date(),
      currency: orgCurrency,
      exchangeRate: 1,
      reference: "",
      lines: [
        {
          itemId: "",
          incomeAccountId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          unitOfMeasureId: "",
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

  const activeCustomers = useMemo(
    () => (Array.isArray(customers) ? customers : []).filter((customer) => customer.isActive),
    [customers],
  );
  const activeTaxCodes = useMemo(
    () => (Array.isArray(taxCodes) ? taxCodes : []).filter((code) => code.isActive),
    [taxCodes],
  );
  const incomeAccounts = useMemo(
    () => accounts.filter((account) => account.type === "INCOME" && account.isActive),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((account) => account.type === "EXPENSE" && account.isActive),
    [accounts],
  );
  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.type === "ASSET" && account.isActive),
    [accounts],
  );

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const taxCodesById = useMemo(() => new Map(taxCodes.map((code) => [code.id, code])), [taxCodes]);
  const unitsById = useMemo(() => new Map(unitsOfMeasure.map((unit) => [unit.id, unit])), [unitsOfMeasure]);
  const activeUnits = useMemo(
    () => (Array.isArray(unitsOfMeasure) ? unitsOfMeasure : []).filter((unit) => unit.isActive),
    [unitsOfMeasure],
  );
  const baseUnitId = useMemo(() => {
    const eachUnit = unitsOfMeasure.find((unit) => unit.name === "Each" && unit.isActive);
    if (eachUnit) {
      return eachUnit.id;
    }
    return unitsOfMeasure.find((unit) => !unit.baseUnitId && unit.isActive)?.id ?? "";
  }, [unitsOfMeasure]);

  const isReadOnly = !canWrite || (!isNew && invoice?.status !== "DRAFT");
  const showAdvancedSection = false;

  useEffect(() => {
    if (isAccountant) {
      setAdvancedOpen(true);
    }
  }, [isAccountant]);

  const loadReferenceData = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, customerData, taxResult, accountData, unitResult] = await Promise.all([
        apiFetch<{
          baseCurrency?: string;
          vatEnabled?: boolean;
          orgSettings?: { lockDate?: string | null; negativeStockPolicy?: NegativeStockPolicy | null };
        }>("/orgs/current"),
        apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
        apiFetch<TaxCodeRecord[] | PaginatedResponse<TaxCodeRecord>>("/tax-codes").catch(() => []),
        apiFetch<AccountRecord[]>("/accounts").catch(() => []),
        apiFetch<UnitOfMeasureRecord[] | PaginatedResponse<UnitOfMeasureRecord>>(
          "/units-of-measurement?isActive=true",
        ).catch(() => []),
      ]);
      const taxData = Array.isArray(taxResult) ? taxResult : taxResult.data ?? [];
      const unitData = Array.isArray(unitResult) ? unitResult : unitResult.data ?? [];
      setOrgCurrency(org.baseCurrency ?? "AED");
      setVatEnabled(Boolean(org.vatEnabled));
      setNegativeStockPolicy(org.orgSettings?.negativeStockPolicy ?? "ALLOW");
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setCustomers(customerData.data);
      setTaxCodes(taxData);
      setAccounts(accountData);
      setUnitsOfMeasure(unitData);
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load invoice references.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

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
        const result = await apiFetch<ItemRecord[] | PaginatedResponse<ItemRecord>>(
          `/items?${params.toString()}`,
        );
        const data = Array.isArray(result) ? result : result.data ?? [];
        const filtered = data.filter((item) =>
          allowedCategories.includes(item.type as ItemCreateInput["type"]),
        );
        if (!active) {
          return;
        }
        setItemSearchResults(filtered);
        setItems((prev) => {
          const merged = new Map(prev.map((item) => [item.id, item]));
          filtered.forEach((item) => merged.set(item.id, item));
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
  }, [itemSearchTerm, allowedCategories]);

  useEffect(() => {
    if (!invoice?.lines?.length) {
      return;
    }
    const missingIds = Array.from(
      new Set(invoice.lines.map((line) => line.itemId).filter((id): id is string => Boolean(id))),
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
  }, [invoice, itemsById]);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<InvoiceRecord>(`/invoices/${invoiceId}`);
      setInvoice(data);
      const lineDefaults = data.lines.map((line) => ({
        itemId: line.itemId ?? "",
        incomeAccountId: line.incomeAccountId ?? "",
        description: line.description ?? "",
        qty: Number(line.qty),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount ?? 0),
        unitOfMeasureId: line.unitOfMeasureId ?? "",
        taxCodeId: line.taxCodeId ?? "",
      }));
      form.reset({
        customerId: data.customerId,
        invoiceDate: new Date(data.invoiceDate),
        dueDate: new Date(data.dueDate),
        currency: data.currency,
        exchangeRate: data.exchangeRate != null ? Number(data.exchangeRate) : 1,
        reference: data.reference ?? "",
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
  }, [invoiceId, form, replace]);

  const loadAttachments = useCallback(async () => {
    if (isNew || !invoice?.id) {
      setAttachments([]);
      return;
    }
    setAttachmentsLoading(true);
    try {
      setAttachmentsError(null);
      const params = new URLSearchParams({ entityType: "INVOICE", entityId: invoice.id });
      const data = await apiFetch<AttachmentRecord[]>(`/attachments?${params.toString()}`);
      setAttachments(data ?? []);
    } catch (err) {
      setAttachmentsError(err instanceof Error ? err.message : "Unable to load attachments.");
    } finally {
      setAttachmentsLoading(false);
    }
  }, [invoice?.id, isNew]);

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
    if (!invoice?.id) {
      return;
    }
    const trimmedName = attachmentForm.name.trim();
    const trimmedUrl = attachmentForm.url.trim();
    const trimmedDescription = attachmentForm.description.trim();
    const file = attachmentForm.file;

    if (!file && !trimmedUrl) {
      setAttachmentError("Select a file or provide a URL.");
      return;
    }

    setAttachmentSaving(true);
    setAttachmentError(null);
    try {
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", "INVOICE");
        formData.append("entityId", invoice.id);
        if (trimmedDescription) {
          formData.append("description", trimmedDescription);
        }
        const response = await withAuthRetry(`${apiBaseUrl}/attachments/upload`, {
          method: "POST",
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = payload?.error?.message ?? "Unable to upload attachment.";
          throw new Error(message);
        }
        const created = payload?.data ?? payload;
        setAttachments((prev) => [created, ...prev]);
      } else if (trimmedUrl) {
        const created = await apiFetch<AttachmentRecord>("/attachments", {
          method: "POST",
          body: JSON.stringify({
            entityType: "INVOICE",
            entityId: invoice.id,
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
      setAttachmentDialogOpen(false);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : "Unable to save attachment.");
    } finally {
      setAttachmentSaving(false);
    }
  }, [attachmentForm, invoice?.id, withAuthRetry]);

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

  const handleRetry = useCallback(() => {
    loadReferenceData();
    if (!isNew && !invoice) {
      loadInvoice();
    }
    if (!isNew) {
      loadAttachments();
    }
  }, [loadReferenceData, loadInvoice, loadAttachments, isNew, invoice]);

  useEffect(() => {
    if (postDialogOpen) {
      return;
    }
    setPostError(null);
    setPosting(false);
    setNegativeStockOverrideReason("");
  }, [postDialogOpen]);

  useEffect(() => {
    if (isNew) {
      form.reset({
        customerId: "",
        invoiceDate: new Date(),
        dueDate: new Date(),
        currency: orgCurrency,
        exchangeRate: 1,
        reference: "",
        lines: [
          {
            itemId: "",
            incomeAccountId: "",
            description: "",
            qty: 1,
            unitPrice: 0,
            discountAmount: 0,
            unitOfMeasureId: "",
            taxCodeId: "",
          },
        ],
        notes: "",
        terms: "",
      });
      replace([
        {
          itemId: "",
          incomeAccountId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          unitOfMeasureId: "",
          taxCodeId: "",
        },
      ]);
      return;
    }



    loadInvoice();
  }, [form, invoiceId, isNew, orgCurrency, replace]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const lineValues = useWatch({ control: form.control, name: "lines" }) ?? [];
  useEffect(() => {
    if (!baseUnitId) {
      return;
    }
    const currentLines = form.getValues("lines");
    currentLines.forEach((line, index) => {
      if (!line.unitOfMeasureId) {
        form.setValue(`lines.${index}.unitOfMeasureId`, baseUnitId);
      }
    });
  }, [baseUnitId, form]);
  const invoiceDateValue = form.watch("invoiceDate");
  const currencyValue = form.watch("currency") ?? orgCurrency;
  const showMultiCurrencyWarning = currencyValue !== orgCurrency;
  const isLocked = isDateLocked(lockDate, invoiceDateValue);
  const postNegativeStockWarning = useMemo(() => {
    const details =
      postError && typeof postError === "object" && "details" in postError
        ? (postError as { details?: unknown }).details
        : undefined;
    return parseNegativeStockWarning(details);
  }, [postError]);
  const overrideReasonTrimmed = negativeStockOverrideReason.trim();

  const resolvedLineValues = useMemo(() => {
    if (lineValues.length === fields.length) {
      return lineValues;
    }
    return fields.map((_, index) => {
      return (
        form.getValues(`lines.${index}`) ?? {
          itemId: "",
          incomeAccountId: "",
          description: "",
          qty: 0,
          unitPrice: 0,
          discountAmount: 0,
          unitOfMeasureId: "",
          taxCodeId: "",
        }
      );
    });
  }, [fields, form, lineValues]);

  const lineCalculations = useMemo(() => {
    return resolvedLineValues.map((line) => {
      const qty = Number(line.qty ?? 0);
      const grossCents = calculateGrossCents(qty, line.unitPrice ?? 0);
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
  }, [resolvedLineValues, taxCodesById, vatEnabled]);

  const lineIssues = useMemo(() => {
    return resolvedLineValues.map((line) => {
      const qty = Number(line.qty ?? 0);
      const unitPrice = Number(line.unitPrice ?? 0);
      const discountAmount = Number(line.discountAmount ?? 0);
      const grossCents = calculateGrossCents(qty, unitPrice);
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
  }, [resolvedLineValues, vatEnabled]);

  const formatNumber = (value: string | number | null | undefined, options?: Intl.NumberFormatOptions) => {
    const parsed = value === null || value === undefined || value === "" ? 0 : Number(value);
    if (!Number.isFinite(parsed)) {
      return "-";
    }
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6, ...options }).format(parsed);
  };

  const formatQuantity = (value: string | number | null | undefined) => formatNumber(value, { maximumFractionDigits: 6 });

  const formatRate = (value: string | number | null | undefined) =>
    formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  const getUnitRate = (unitId?: string | null) => {
    if (!unitId) {
      return 1;
    }
    const unit = unitsById.get(unitId);
    return unit?.conversionRate != null ? Number(unit.conversionRate) : 1;
  };

  const convertUnitPrice = (price: number, fromUnitId?: string | null, toUnitId?: string | null) => {
    if (!Number.isFinite(price) || !fromUnitId || !toUnitId || fromUnitId === toUnitId) {
      return price;
    }
    const fromRate = getUnitRate(fromUnitId);
    const toRate = getUnitRate(toUnitId);
    if (!fromRate || !toRate) {
      return price;
    }
    const converted = price * (toRate / fromRate);
    return Number.isFinite(converted) ? Number(converted.toFixed(6)) : price;
  };

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

  const isCellActive = (row: number, field: LineGridField) =>
    activeCell?.row === row && activeCell.field === field;

  const activateCell = (row: number, field: LineGridField) => {
    if (isReadOnly) {
      return;
    }
    setActiveCell({ row, field });
    if (field === "qty") {
      setTimeout(() => form.setFocus(`lines.${row}.qty`), 0);
    }
    if (field === "rate") {
      setTimeout(() => form.setFocus(`lines.${row}.unitPrice`), 0);
    }
  };

  const toggleRowDetails = (rowId: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

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
      const incomeAccountId = line.incomeAccountId ?? item.incomeAccountId;
      if (!incomeAccountId) {
        return;
      }
      const revenue = Number(line.lineSubTotal);
      revenueTotals.set(incomeAccountId, (revenueTotals.get(incomeAccountId) ?? 0) + revenue);
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

  const postInvoice = async (options?: { override?: boolean; reason?: string }) => {
    if (!invoice || !canPost) {
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const result = await apiFetch<InvoicePostResponse>(`/invoices/${invoice.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          negativeStockOverride: Boolean(options?.override),
          negativeStockOverrideReason: options?.override ? options?.reason : undefined,
        }),
      });
      setInvoice(result.invoice);
      setPostDialogOpen(false);
      const warning = parseNegativeStockWarning(result.warnings?.negativeStock);
      if (warning) {
        const title = warning.overrideApplied ? "Invoice posted with override" : "Invoice posted with warning";
        toast({
          title,
          description: `${warning.items.length} item(s) would go negative.`,
        });
      } else {
        toast({ title: "Invoice posted", description: "Ledger entries created." });
      }
    } catch (err) {
      setPostError(err);
      const details =
        err && typeof err === "object" && "details" in err ? (err as { details?: unknown }).details : undefined;
      if (!parseNegativeStockWarning(details)) {
        showErrorToast("Unable to post invoice", err);
      }
    } finally {
      setPosting(false);
    }
  };

  const voidInvoice = async () => {
    if (!invoice || !canPost) {
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      const result = await apiFetch<{ invoice: InvoiceRecord }>(`/invoices/${invoice.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setInvoice(result.invoice);
      setVoidDialogOpen(false);
      toast({ title: "Invoice voided", description: "A reversal entry was created." });
    } catch (err) {
      setVoidError(err);
      showErrorToast("Unable to void invoice", err);
    } finally {
      setVoiding(false);
    }
  };

  const createCreditNoteFromInvoice = async () => {
    if (!invoice || !canWrite) {
      return;
    }
    setCreatingCreditNote(true);
    try {
      const payload: CreditNoteCreateInput = {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        creditNoteDate: new Date(),
        currency: invoice.currency ?? orgCurrency,
        exchangeRate: Number(invoice.exchangeRate ?? 1),
        lines: invoice.lines.map((line) => {
          const description = (line.description ?? "").trim();
          const itemName = line.itemId ? itemsById.get(line.itemId)?.name : undefined;
          const safeDescription = description.length >= 2 ? description : itemName ?? "Line item";
          const qty = Number(line.qty ?? 0);
          const unitPrice = Number(line.unitPrice ?? 0);
          const discountAmount = Number(line.discountAmount ?? 0);
          return {
            itemId: line.itemId ?? undefined,
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
            incomeAccountId: line.incomeAccountId ?? undefined,
            description: safeDescription,
            qty: Number.isFinite(qty) ? qty : 0,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            discountAmount: Number.isFinite(discountAmount) ? discountAmount : 0,
            taxCodeId: line.taxCodeId ?? undefined,
          };
        }),
      };

      const created = await apiFetch<{ id: string }>("/credit-notes", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });
      toast({
        title: "Credit note created",
        description: invoice.number ? `Draft created from invoice ${invoice.number}.` : "Draft created from invoice.",
      });
      router.push(`/credit-notes/${created.id}`);
    } catch (err) {
      showErrorToast("Unable to create credit note", err);
    } finally {
      setCreatingCreditNote(false);
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
    form.setValue(`lines.${index}.incomeAccountId`, "");
    const resolvedUnitId = item.unitOfMeasureId ?? baseUnitId;
    if (resolvedUnitId) {
      form.setValue(`lines.${index}.unitOfMeasureId`, resolvedUnitId);
    }
    if (item.defaultTaxCodeId) {
      form.setValue(`lines.${index}.taxCodeId`, item.defaultTaxCodeId);
    }
  };

  const handleItemCreated = (item: ItemQuickCreateRecord) => {
    setItems((prev) => {
      const merged = new Map(prev.map((entry) => [entry.id, entry]));
      merged.set(item.id, {
        id: item.id,
        name: item.name,
        type: item.type,
        salePrice: item.salePrice,
        incomeAccountId: item.incomeAccountId,
        expenseAccountId: item.expenseAccountId ?? null,
        inventoryAccountId: item.inventoryAccountId ?? null,
        fixedAssetAccountId: item.fixedAssetAccountId ?? null,
        unitOfMeasureId: item.unitOfMeasureId ?? null,
        defaultTaxCodeId: item.defaultTaxCodeId ?? null,
        isActive: item.isActive,
      });
      return Array.from(merged.values());
    });
    setItemSearchResults((prev) => {
      const merged = new Map(prev.map((entry) => [entry.id, entry]));
      merged.set(item.id, {
        id: item.id,
        name: item.name,
        type: item.type,
        salePrice: item.salePrice,
        incomeAccountId: item.incomeAccountId,
        expenseAccountId: item.expenseAccountId ?? null,
        inventoryAccountId: item.inventoryAccountId ?? null,
        fixedAssetAccountId: item.fixedAssetAccountId ?? null,
        unitOfMeasureId: item.unitOfMeasureId ?? null,
        defaultTaxCodeId: item.defaultTaxCodeId ?? null,
        isActive: item.isActive,
      });
      return Array.from(merged.values());
    });

    if (createItemTargetIndex !== null) {
      form.setValue(`lines.${createItemTargetIndex}.itemId`, item.id);
      form.setValue(`lines.${createItemTargetIndex}.description`, item.name);
      form.setValue(`lines.${createItemTargetIndex}.unitPrice`, Number(item.salePrice ?? 0));
      form.setValue(`lines.${createItemTargetIndex}.incomeAccountId`, "");
      const resolvedUnitId = item.unitOfMeasureId ?? baseUnitId;
      if (resolvedUnitId) {
        form.setValue(`lines.${createItemTargetIndex}.unitOfMeasureId`, resolvedUnitId);
      }
      if (item.defaultTaxCodeId) {
        form.setValue(`lines.${createItemTargetIndex}.taxCodeId`, item.defaultTaxCodeId);
      }
    }
    setCreateItemTargetIndex(null);
  };

  if (loading) {
    return (
      <div className="card">
        <PageHeader
          title="Invoices"
          heading={isNew ? "New Invoice" : "Invoice"}
          description="Loading invoice details."
          icon={<Receipt className="h-5 w-5" />}
        />
        <p className="muted">Loading invoice...</p>
      </div>
    );
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <PageHeader
          title="Invoices"
          heading="New Invoice"
          description="You do not have permission to create invoices."
          icon={<Receipt className="h-5 w-5" />}
        />
        <Button variant="secondary" onClick={() => router.push("/invoices")}>
          Back to invoices
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && invoice?.updatedAt ? formatDateTime(invoice.updatedAt) : null;
  const postedAt = !isNew && invoice?.postedAt ? formatDateTime(invoice.postedAt) : null;
  const headerHeading = isNew ? "New Invoice" : invoice?.number ?? "Draft Invoice";
  const headerDescription = isNew
    ? "Capture customer invoice details."
    : `${invoice?.customer?.name ?? "Customer"} | ${invoice?.currency ?? orgCurrency}`;
  const headerMeta =
    !isNew && (lastSavedAt || postedAt) ? (
      <p className="muted">
        {lastSavedAt ? `Last saved at ${lastSavedAt}` : null}
        {lastSavedAt && postedAt ? " - " : null}
        {postedAt ? `Posted at ${postedAt}` : null}
      </p>
    ) : null;

  return (
    <div className="card">
      <PageHeader
        title="Invoices"
        heading={headerHeading}
        description={headerDescription}
        meta={headerMeta}
        icon={<Receipt className="h-5 w-5" />}
        actions={!isNew ? <StatusChip status={invoice?.status ?? "DRAFT"} /> : null}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={handleRetry} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={invoiceDateValue} actionLabel="saving or posting" />
      {showMultiCurrencyWarning ? (
        <p className="form-error">Multi-currency is not fully supported yet. Review exchange rates before posting.</p>
      ) : null}
      {form.formState.submitCount > 0 ? <ValidationSummary errors={form.formState.errors} /> : null}

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
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
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
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
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

        {showAdvancedSection ? (
          <>
            <div style={{ height: 16 }} />
            <details
              className="card"
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-sm font-semibold">Advanced</summary>
              <div style={{ height: 12 }} />
              <div className="form-grid">
                <label>
                  Reference / PO
                  <Input disabled={isReadOnly} {...form.register("reference")} />
                </label>
                <label>
                  Exchange Rate
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    disabled={isReadOnly}
                    {...form.register("exchangeRate", { valueAsNumber: true })}
                  />
                  <p className="muted">Use 1.0 for base currency. Review before posting.</p>
                </label>
              </div>
              <div style={{ height: 12 }} />
              <p className="muted">
                VAT treatment follows UAE defaults. Select tax codes per line where applicable.
              </p>
              <div style={{ height: 8 }} />
            </details>
          </>
        ) : null}

        <div style={{ height: 16 }} />
        <h2>Line items</h2>
        <Table className="line-items-grid">
          <TableHeader>
            <TableRow>
              <TableHead className="col-item">Item</TableHead>
              <TableHead className="col-qty text-right">Qty</TableHead>
              <TableHead className="col-unit">Unit</TableHead>
              <TableHead className="col-rate text-right">Rate</TableHead>
              <TableHead className="col-line-total text-right">Line Total</TableHead>
              <TableHead className="col-actions">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const lineCalc = lineCalculations[index];
              const lineIssue = lineIssues[index];
              const lineValue = resolvedLineValues[index];
              const lineItem = lineValue?.itemId ? itemsById.get(lineValue.itemId) : undefined;
              const itemUnitId = lineItem?.unitOfMeasureId ?? baseUnitId;
              const itemBaseUnitId = itemUnitId ? (unitsById.get(itemUnitId)?.baseUnitId ?? itemUnitId) : "";
              const compatibleUnits = itemBaseUnitId
                ? activeUnits.filter((unit) => (unit.baseUnitId ?? unit.id) === itemBaseUnitId)
                : activeUnits;
              const selectedUnitId = lineValue?.unitOfMeasureId ?? "";
              const selectedUnit = selectedUnitId ? unitsById.get(selectedUnitId) : undefined;
              const unitOptions =
                selectedUnitId && !compatibleUnits.some((unit) => unit.id === selectedUnitId)
                  ? [unitsById.get(selectedUnitId), ...compatibleUnits].filter(
                      (unit): unit is UnitOfMeasureRecord => Boolean(unit),
                    )
                  : compatibleUnits;
              const qtyField = form.register(`lines.${index}.qty`, { valueAsNumber: true });
              const rateField = form.register(`lines.${index}.unitPrice`, { valueAsNumber: true });
              const rowId = field.id;
              const isExpanded = Boolean(expandedRows[rowId]);
              return (
                <Fragment key={field.id}>
                  <TableRow data-expanded={isExpanded ? "true" : "false"} className="line-grid-row">
                    <TableCell className="col-item" data-label="Item">
                      <EditableCell
                        isActive={isCellActive(index, "item")}
                        onActivate={() => activateCell(index, "item")}
                        isReadOnly={isReadOnly}
                        display={lineItem?.name ?? lineValue?.description ?? ""}
                        placeholder="Select item"
                      >
                        <Controller
                          control={form.control}
                          name={`lines.${index}.itemId`}
                          render={({ field }) => (
                            <ItemCombobox
                              value={field.value ?? ""}
                              selectedLabel={
                                field.value
                                  ? itemsById.get(field.value)?.name ?? resolvedLineValues?.[index]?.description
                                  : undefined
                              }
                              options={(() => {
                                const selectedItem = field.value ? itemsById.get(field.value) : undefined;
                                const combined = selectedItem
                                  ? [
                                      selectedItem,
                                      ...itemSearchResults.filter((item) => item.id !== selectedItem.id),
                                    ]
                                  : itemSearchResults;
                                return combined.map((item) => ({
                                  id: item.id,
                                  label: item.name,
                                  description: item.sku ? `SKU ${item.sku}` : undefined,
                                }));
                              })()}
                              onValueChange={(value) => {
                                field.onChange(value);
                                updateLineItem(index, value);
                                if (!isReadOnly) {
                                  setActiveCell({ row: index, field: "qty" });
                                  setTimeout(() => form.setFocus(`lines.${index}.qty`), 0);
                                }
                              }}
                              onSearchChange={setItemSearchTerm}
                              isLoading={itemSearchLoading}
                              disabled={isReadOnly}
                              onCreateNew={(label) => {
                                setCreateItemName(label);
                                setCreateItemTargetIndex(index);
                                setCreateItemOpen(true);
                              }}
                            />
                          )}
                        />
                      </EditableCell>
                      {renderFieldError(form.formState.errors.lines?.[index]?.itemId?.message)}
                    </TableCell>
                    <TableCell className="col-qty" data-label="Qty">
                      <EditableCell
                        isActive={isCellActive(index, "qty")}
                        onActivate={() => activateCell(index, "qty")}
                        isReadOnly={isReadOnly}
                        align="right"
                        display={formatQuantity(lineValue?.qty)}
                      >
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={isReadOnly}
                          {...qtyField}
                          onBlur={(event) => {
                            qtyField.onBlur(event);
                            setActiveCell(null);
                          }}
                          className={lineIssue?.qtyError ? "border-destructive focus-visible:ring-destructive text-right" : "text-right"}
                        />
                      </EditableCell>
                      {lineIssue?.qtyError ? <p className="form-error">{lineIssue.qtyError}</p> : null}
                      {renderFieldError(form.formState.errors.lines?.[index]?.qty?.message)}
                    </TableCell>
                    <TableCell className="col-unit" data-label="Unit">
                      <EditableCell
                        isActive={isCellActive(index, "unit")}
                        onActivate={() => activateCell(index, "unit")}
                        isReadOnly={isReadOnly}
                        display={selectedUnit ? `${selectedUnit.name} (${selectedUnit.symbol})` : ""}
                        placeholder="Select unit"
                      >
                        <Controller
                          control={form.control}
                          name={`lines.${index}.unitOfMeasureId`}
                          render={({ field }) => (
                            <Select
                              value={field.value ?? baseUnitId ?? ""}
                              onValueChange={(value) => {
                                const previousUnitId = field.value ?? baseUnitId ?? "";
                                field.onChange(value);
                                if (isReadOnly) {
                                  return;
                                }
                                const currentPrice = Number(form.getValues(`lines.${index}.unitPrice`) ?? 0);
                                const nextPrice = convertUnitPrice(currentPrice, previousUnitId, value);
                                form.setValue(`lines.${index}.unitPrice`, nextPrice, { shouldDirty: true });
                                setActiveCell(null);
                              }}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger aria-label="Unit of measure">
                                <SelectValue placeholder="Select unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {unitOptions.map((unit) => (
                                  <SelectItem key={unit.id} value={unit.id}>
                                    {unit.name} ({unit.symbol})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </EditableCell>
                      {renderFieldError(form.formState.errors.lines?.[index]?.unitOfMeasureId?.message)}
                    </TableCell>
                    <TableCell className="col-rate" data-label="Rate">
                      <EditableCell
                        isActive={isCellActive(index, "rate")}
                        onActivate={() => activateCell(index, "rate")}
                        isReadOnly={isReadOnly}
                        align="right"
                        display={formatRate(lineValue?.unitPrice)}
                      >
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={isReadOnly}
                          {...rateField}
                          onBlur={(event) => {
                            rateField.onBlur(event);
                            setActiveCell(null);
                          }}
                          className={
                            lineIssue?.unitPriceError
                              ? "border-destructive focus-visible:ring-destructive text-right"
                              : "text-right"
                          }
                        />
                      </EditableCell>
                      {lineIssue?.unitPriceError ? <p className="form-error">{lineIssue.unitPriceError}</p> : null}
                      {renderFieldError(form.formState.errors.lines?.[index]?.unitPrice?.message)}
                    </TableCell>
                    <TableCell className="col-line-total" data-label="Line Total">
                      <div className="line-grid-cell line-grid-cell-right line-grid-cell-static">
                        <span className="line-grid-display">{formatCents(lineCalc?.lineTotalCents ?? 0n)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="col-actions" data-label="Actions">
                      <LineItemRowActions
                        isExpanded={isExpanded}
                        onToggleDetails={() => toggleRowDetails(rowId)}
                        onRemove={() => remove(index)}
                        disableRemove={fields.length === 1}
                        isReadOnly={isReadOnly}
                      />
                    </TableCell>
                  </TableRow>
                  {isExpanded ? (
                    <TableRow className="line-grid-row-details">
                      <TableCell colSpan={6}>
                        <LineItemDetails>
                          <label>
                            Description
                            <Input disabled={isReadOnly} {...form.register(`lines.${index}.description`)} />
                            {renderFieldError(form.formState.errors.lines?.[index]?.description?.message)}
                          </label>
                          <label>
                            Discount
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              disabled={isReadOnly}
                              {...form.register(`lines.${index}.discountAmount`, { valueAsNumber: true })}
                              className={
                                lineIssue?.discountError
                                  ? "border-destructive focus-visible:ring-destructive text-right"
                                  : "text-right"
                              }
                            />
                            {lineIssue?.discountError ? <p className="form-error">{lineIssue.discountError}</p> : null}
                            {renderFieldError(form.formState.errors.lines?.[index]?.discountAmount?.message)}
                          </label>
                          {vatEnabled ? (
                            <label>
                              Tax Code
                              <Controller
                                control={form.control}
                                name={`lines.${index}.taxCodeId`}
                                render={({ field }) => (
                                  <Select
                                    value={field.value ? field.value : "none"}
                                    onValueChange={(value) =>
                                      field.onChange(value === "none" ? undefined : value)
                                    }
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
                            </label>
                          ) : null}
                          {isAccountant ? (
                            <label>
                              Income Account
                              <Controller
                                control={form.control}
                                name={`lines.${index}.incomeAccountId`}
                                render={({ field }) => (
                                  <Select
                                    value={field.value ? field.value : "default"}
                                    onValueChange={(value) =>
                                      field.onChange(value === "default" ? undefined : value)
                                    }
                                    disabled={isReadOnly}
                                  >
                                    <SelectTrigger aria-label="Income account override">
                                      <SelectValue placeholder="Item default" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="default">Item default</SelectItem>
                                      {incomeAccounts.map((account) => (
                                        <SelectItem key={account.id} value={account.id}>
                                          {account.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </label>
                          ) : null}
                        </LineItemDetails>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>

        <div style={{ height: 12 }} />
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            append({
              itemId: "",
              incomeAccountId: "",
              description: "",
              qty: 1,
              unitPrice: 0,
              discountAmount: 0,
              unitOfMeasureId: baseUnitId || "",
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
            <strong>Attachments</strong>
            <p className="muted">Upload support files or paste links for this invoice.</p>
          </div>
          <Dialog
            open={attachmentDialogOpen}
            onOpenChange={(open) => {
              setAttachmentDialogOpen(open);
              if (!open) {
                setAttachmentError(null);
                setAttachmentForm({ name: "", url: "", description: "", file: null });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="secondary" disabled={isNew || !canWrite}>
                Add Attachment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add attachment</DialogTitle>
              </DialogHeader>
              {attachmentError ? <p className="form-error">{attachmentError}</p> : null}
              <div style={{ display: "grid", gap: 12 }}>
                <label>
                  File *
                  <Input
                    type="file"
                    onChange={(event) =>
                      setAttachmentForm((prev) => ({
                        ...prev,
                        file: event.target.files?.[0] ?? null,
                        name: event.target.files?.[0]?.name ?? prev.name,
                      }))
                    }
                  />
                </label>
                <label>
                  File name
                  <Input
                    value={attachmentForm.name}
                    onChange={(event) => setAttachmentForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label>
                  File URL (optional)
                  <Input
                    value={attachmentForm.url}
                    onChange={(event) => setAttachmentForm((prev) => ({ ...prev, url: event.target.value }))}
                    placeholder="https://..."
                  />
                  <p className="muted">Use a link if you do not want to upload a file.</p>
                </label>
                <label>
                  Description
                  <Input
                    value={attachmentForm.description}
                    onChange={(event) => setAttachmentForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button type="button" variant="secondary" onClick={() => setAttachmentDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={attachmentSaving} onClick={uploadAttachment}>
                    {attachmentSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div style={{ height: 12 }} />
        {attachmentsError ? <p className="form-error">{attachmentsError}</p> : null}
        {attachmentsLoading ? <p className="muted">Loading attachments...</p> : null}
        {!attachmentsLoading && attachments.length === 0 ? <p className="muted">No attachments yet.</p> : null}
        {attachments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachments.map((attachment) => {
                const hasUrl = attachment.storageKey?.startsWith("http");
                return (
                  <TableRow key={attachment.id}>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadAttachment(attachment)}
                      >
                        {attachment.fileName}
                      </Button>
                      {hasUrl ? <span className="muted"> (link)</span> : null}
                    </TableCell>
                    <TableCell>{attachment.description ?? "-"}</TableCell>
                    <TableCell>{formatBytes(attachment.sizeBytes)}</TableCell>
                    <TableCell>{attachment.createdAt ? formatDateTime(attachment.createdAt) : "-"}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!canWrite}
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}

        <div style={{ height: 16 }} />
        <div className="form-action-bar">
          <Button type="submit" disabled={saving || isReadOnly || isLocked}>
            {saving ? "Saving..." : isNew ? "Create Draft" : "Save Draft"}
          </Button>
          {!isNew && invoice?.status === "DRAFT" && canPost ? (
            <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" disabled={isLocked}>
                  Post Invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Post invoice</DialogTitle>
                </DialogHeader>
                <LockDateWarning lockDate={lockDate} docDate={invoiceDateValue} actionLabel="posting" />
                <PostImpactSummary mode="post" ledgerLines={ledgerPreview} currency={orgCurrency}>
                  {negativeStockPolicy === "WARN" ? (
                    <p className="muted">Negative stock policy is set to warn. Posting will continue with warning details.</p>
                  ) : null}
                  {negativeStockPolicy === "BLOCK" ? (
                    <p className="muted">Negative stock policy is set to block. Shortfalls must be corrected or overridden.</p>
                  ) : null}
                  {postNegativeStockWarning ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                      <div className="font-semibold">Negative stock warning</div>
                      <div className="muted">
                        Posting this invoice would create negative stock for {postNegativeStockWarning.items.length} item(s).
                      </div>
                      <div style={{ height: 8 }} />
                      <ul className="list-disc pl-5">
                        {postNegativeStockWarning.items.map((item) => {
                          const itemLabel = itemsById.get(item.itemId)?.name ?? item.itemId;
                          return (
                            <li key={item.itemId}>
                              {itemLabel}: on hand {formatQuantity(item.onHandQty)}, issue {formatQuantity(item.issueQty)},
                              projected {formatQuantity(item.projectedQty)}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </PostImpactSummary>
                {postError && !postNegativeStockWarning ? <ErrorBanner error={postError} /> : null}
                <div style={{ height: 12 }} />
                <Button type="button" onClick={() => postInvoice()} disabled={isLocked || posting}>
                  {posting ? "Posting..." : "Confirm Post"}
                </Button>
                {postNegativeStockWarning?.policy === "BLOCK" ? (
                  canOverrideNegativeStock ? (
                    <>
                      <div style={{ height: 12 }} />
                      <label>
                        Override reason (required)
                        <Input
                          value={negativeStockOverrideReason}
                          onChange={(event) => setNegativeStockOverrideReason(event.target.value)}
                          placeholder="Explain why this override is needed"
                        />
                        {overrideReasonTrimmed.length > 0 && overrideReasonTrimmed.length < 3 ? (
                          <p className="form-error">Provide at least 3 characters.</p>
                        ) : null}
                      </label>
                      <div style={{ height: 8 }} />
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() =>
                          postInvoice({
                            override: true,
                            reason: overrideReasonTrimmed,
                          })
                        }
                        disabled={isLocked || posting || overrideReasonTrimmed.length < 3}
                      >
                        {posting ? "Posting..." : "Confirm Post With Override"}
                      </Button>
                    </>
                  ) : (
                    <p className="muted">You do not have permission to override a negative stock block.</p>
                  )
                ) : null}
              </DialogContent>
            </Dialog>
          ) : null}
          {!isNew && invoice?.status === "POSTED" && canWrite ? (
            <Button type="button" variant="secondary" onClick={createCreditNoteFromInvoice} disabled={creatingCreditNote}>
              {creatingCreditNote ? "Creating..." : "Create Credit Note"}
            </Button>
          ) : null}
          {!isNew && invoice?.status === "POSTED" && canPost ? (
            <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={isLocked || voiding}>
                  Void Invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Void invoice</DialogTitle>
                </DialogHeader>
                <LockDateWarning lockDate={lockDate} docDate={invoiceDateValue} actionLabel="voiding" />
                <PostImpactSummary mode="void" />
                {voidError ? <ErrorBanner error={voidError} /> : null}
                <div style={{ height: 12 }} />
                <Button type="button" variant="destructive" onClick={() => voidInvoice()} disabled={isLocked || voiding}>
                  {voiding ? "Voiding..." : "Confirm Void"}
                </Button>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </form>
      <ItemQuickCreateDialog
        open={createItemOpen}
        onOpenChange={setCreateItemOpen}
        defaultName={createItemName}
        vatEnabled={vatEnabled}
        incomeAccounts={incomeAccounts}
        expenseAccounts={expenseAccounts}
        assetAccounts={assetAccounts}
        taxCodes={taxCodes}
        allowedCategories={allowedCategories}
        onCreated={handleItemCreated}
      />
    </div>
  );
}
