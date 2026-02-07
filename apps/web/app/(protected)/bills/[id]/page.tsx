"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  billCreateSchema,
  Permissions,
  type DebitNoteCreateInput,
  type BillCreateInput,
  type BillLineCreateInput,
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
import { AccountCombobox } from "../../../../src/lib/ui-account-combobox";
import { ItemQuickCreateDialog, type ItemQuickCreateRecord } from "../../../../src/lib/ui-item-quick-create";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";
import { useUiMode } from "../../../../src/lib/use-ui-mode";

type VendorRecord = { id: string; name: string; isActive: boolean; paymentTermsDays: number };

type ItemRecord = {
  id: string;
  name: string;
  sku?: string | null;
  type: string;
  purchasePrice?: string | number | null;
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

type AccountRecord = { id: string; name: string; code?: string | null; subtype?: string | null; type: string; isActive: boolean };

type BillLineRecord = {
  id: string;
  itemId?: string | null;
  expenseAccountId: string;
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
  amountPaid?: string | number;
  reference?: string | null;
  notes?: string | null;
  updatedAt?: string;
  postedAt?: string | null;
  lines: BillLineRecord[];
  vendor: { id: string; name: string };
};

type LineGridField = "item" | "qty" | "unit" | "rate";

type AttachmentRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  description?: string | null;
  createdAt?: string;
};

const PAYMENT_TERMS_OPTIONS = [
  { value: "0", label: "Due on receipt" },
  { value: "7", label: "Net 7" },
  { value: "15", label: "Net 15" },
  { value: "30", label: "Net 30" },
  { value: "45", label: "Net 45" },
  { value: "60", label: "Net 60" },
  { value: "90", label: "Net 90" },
  { value: "custom", label: "Custom" },
];
const PAYMENT_TERMS_DAY_VALUES = new Set(
  PAYMENT_TERMS_OPTIONS.filter((option) => option.value !== "custom").map((option) => option.value),
);
const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const diffDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY_MS);
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
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<UnitOfMeasureRecord[]>([]);
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
  const [creatingDebitNote, setCreatingDebitNote] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [createItemName, setCreateItemName] = useState<string | undefined>();
  const [createItemTargetIndex, setCreateItemTargetIndex] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; field: LineGridField } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [favoriteExpenseAccounts, setFavoriteExpenseAccounts] = useState<string[]>([]);
  const [recentExpenseAccounts, setRecentExpenseAccounts] = useState<string[]>([]);
  const [paymentTermsValue, setPaymentTermsValue] = useState<string>("custom");
  const [dueDateManual, setDueDateManual] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkItemSearch, setBulkItemSearch] = useState("");
  const [bulkItemResults, setBulkItemResults] = useState<ItemRecord[]>([]);
  const [bulkItemLoading, setBulkItemLoading] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
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
  const canWrite = hasPermission(Permissions.BILL_WRITE);
  const canPost = hasPermission(Permissions.BILL_POST);

  const form = useForm<BillCreateInput>({
    resolver: zodResolver(billCreateSchema),
    defaultValues: {
      vendorId: "",
      billDate: new Date(),
      dueDate: new Date(),
      currency: orgCurrency,
      exchangeRate: 1,
      billNumber: "",
      reference: "",
      lines: [
        {
          expenseAccountId: "",
          itemId: "",
          description: "",
          qty: 1,
          unitPrice: 0,
          discountAmount: 0,
          unitOfMeasureId: "",
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

  const activeVendors = useMemo(
    () => (Array.isArray(vendors) ? vendors : []).filter((vendor) => vendor.isActive),
    [vendors],
  );
  const activeTaxCodes = useMemo(
    () => (Array.isArray(taxCodes) ? taxCodes : []).filter((code) => code.isActive),
    [taxCodes],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((account) => account.type === "EXPENSE" && account.isActive),
    [accounts],
  );
  const incomeAccounts = useMemo(
    () => accounts.filter((account) => account.type === "INCOME" && account.isActive),
    [accounts],
  );
  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.type === "ASSET" && account.isActive),
    [accounts],
  );
  const lineAccountOptions = useMemo(
    () =>
      accounts
        .filter((account) => ["EXPENSE", "ASSET"].includes(account.type) && account.isActive)
        .map((account) => ({
          id: account.id,
          label: account.name,
          description: account.code ?? account.subtype ?? undefined,
        })),
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

  const isReadOnly = !canWrite || (!isNew && bill?.status !== "DRAFT");

  useEffect(() => {
    if (isAccountant) {
      setAdvancedOpen(true);
    }
  }, [isAccountant]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("ledgerlite.favoriteExpenseAccounts");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        setFavoriteExpenseAccounts(parsed);
      } catch {
        setFavoriteExpenseAccounts([]);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("ledgerlite.favoriteExpenseAccounts", JSON.stringify(favoriteExpenseAccounts));
  }, [favoriteExpenseAccounts]);

  const loadReferenceData = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, vendorResult, taxResult, accountData, unitResult] = await Promise.all([
        apiFetch<{ baseCurrency?: string; vatEnabled?: boolean; orgSettings?: { lockDate?: string | null } }>(
          "/orgs/current",
        ),
        apiFetch<VendorRecord[] | PaginatedResponse<VendorRecord>>("/vendors"),
        apiFetch<TaxCodeRecord[] | PaginatedResponse<TaxCodeRecord>>("/tax-codes").catch(() => []),
        apiFetch<AccountRecord[]>("/accounts").catch(() => []),
        apiFetch<UnitOfMeasureRecord[] | PaginatedResponse<UnitOfMeasureRecord>>(
          "/units-of-measurement?isActive=true",
        ).catch(() => []),
      ]);
      const vendorData = Array.isArray(vendorResult) ? vendorResult : vendorResult.data ?? [];
      const taxData = Array.isArray(taxResult) ? taxResult : taxResult.data ?? [];
      const unitData = Array.isArray(unitResult) ? unitResult : unitResult.data ?? [];
      setOrgCurrency(org.baseCurrency ?? "AED");
      setVatEnabled(Boolean(org.vatEnabled));
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setVendors(vendorData);
      setTaxCodes(taxData);
      setAccounts(accountData);
      setUnitsOfMeasure(unitData);
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load bill references.");
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
    if (!bulkAddOpen) {
      setBulkItemResults([]);
      setBulkSelectedIds([]);
      setBulkItemSearch("");
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      setBulkItemLoading(true);
      try {
        const params = new URLSearchParams();
        const trimmed = bulkItemSearch.trim();
        if (trimmed) {
          params.set("search", trimmed);
        }
        params.set("isActive", "true");
        const result = await apiFetch<ItemRecord[] | PaginatedResponse<ItemRecord>>(
          `/items?${params.toString()}`,
        );
        const data = Array.isArray(result) ? result : result.data ?? [];
        if (!active) {
          return;
        }
        setBulkItemResults(data);
        setItems((prev) => {
          const merged = new Map(prev.map((item) => [item.id, item]));
          data.forEach((item) => merged.set(item.id, item));
          return Array.from(merged.values());
        });
      } catch {
        if (active) {
          setBulkItemResults([]);
        }
      } finally {
        if (active) {
          setBulkItemLoading(false);
        }
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [bulkAddOpen, bulkItemSearch]);

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

  const loadBill = useCallback(async () => {
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
        unitOfMeasureId: line.unitOfMeasureId ?? "",
        taxCodeId: line.taxCodeId ?? "",
      }));
      form.reset({
        vendorId: data.vendorId,
        billDate: new Date(data.billDate),
        dueDate: new Date(data.dueDate),
        currency: data.currency,
        exchangeRate: data.exchangeRate != null ? Number(data.exchangeRate) : 1,
        billNumber: data.billNumber ?? "",
        reference: data.reference ?? "",
        lines: lineDefaults,
        notes: data.notes ?? "",
      });
      replace(lineDefaults);
      const computedDays = diffDays(new Date(data.billDate), new Date(data.dueDate));
      if (PAYMENT_TERMS_DAY_VALUES.has(String(computedDays))) {
        setPaymentTermsValue(String(computedDays));
        setDueDateManual(false);
      } else {
        setPaymentTermsValue("custom");
        setDueDateManual(true);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err : "Unable to load bill.");
    } finally {
      setLoading(false);
    }
  }, [billId, form, replace]);

  const loadAttachments = useCallback(async () => {
    if (isNew || !bill?.id) {
      setAttachments([]);
      return;
    }
    setAttachmentsLoading(true);
    try {
      setAttachmentsError(null);
      const params = new URLSearchParams({ entityType: "BILL", entityId: bill.id });
      const data = await apiFetch<AttachmentRecord[]>(`/attachments?${params.toString()}`);
      setAttachments(data ?? []);
    } catch (err) {
      setAttachmentsError(err instanceof Error ? err.message : "Unable to load attachments.");
    } finally {
      setAttachmentsLoading(false);
    }
  }, [bill?.id, isNew]);

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
    if (!bill?.id) {
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
        formData.append("entityType", "BILL");
        formData.append("entityId", bill.id);
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
            entityType: "BILL",
            entityId: bill.id,
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
  }, [attachmentForm, bill?.id, withAuthRetry]);

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
    if (!isNew && !bill) {
      loadBill();
    }
  }, [loadReferenceData, loadBill, isNew, bill]);

  useEffect(() => {
    if (isNew) {
      form.reset({
        vendorId: "",
        billDate: new Date(),
        dueDate: new Date(),
        currency: orgCurrency,
        exchangeRate: 1,
        billNumber: "",
        reference: "",
        lines: [
          {
            expenseAccountId: "",
            itemId: "",
            description: "",
            qty: 1,
            unitPrice: 0,
            discountAmount: 0,
            unitOfMeasureId: "",
            taxCodeId: "",
          },
        ],
        notes: "",
      });
      setPaymentTermsValue("custom");
      setDueDateManual(false);
      replace([
        {
          expenseAccountId: "",
          itemId: "",
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



    loadBill();
  }, [form, billId, isNew, orgCurrency, replace]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const lineValues = useWatch({ control: form.control, name: "lines" }) ?? [];
  const applyPaymentTerms = useCallback(
    (termsValue: string, baseDate?: Date) => {
      if (termsValue === "custom") {
        return;
      }
      const days = Number(termsValue);
      if (!Number.isFinite(days)) {
        return;
      }
      const billDate = baseDate ?? form.getValues("billDate");
      if (!billDate) {
        return;
      }
      form.setValue("dueDate", addDays(billDate, days), { shouldDirty: true });
    },
    [form],
  );
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
  const billDateValue = form.watch("billDate");
  const currencyValue = form.watch("currency") || orgCurrency;
  const showMultiCurrencyWarning = currencyValue !== orgCurrency;
  const isLocked = isDateLocked(lockDate, billDateValue);

  const resolvedLineValues = useMemo(() => {
    if (lineValues.length === fields.length) {
      return lineValues;
    }
    return fields.map((_, index) => {
      return (
        form.getValues(`lines.${index}`) ?? {
          expenseAccountId: "",
          itemId: "",
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
  const displaySubTotal = isReadOnly && bill ? formatMoney(bill.subTotal, currencyValue) : formatCents(computedTotals.subTotalCents);
  const displayTaxTotal = isReadOnly && bill ? formatMoney(bill.taxTotal, currencyValue) : formatCents(computedTotals.taxTotalCents);
  const displayTotal = isReadOnly && bill ? formatMoney(bill.total, currencyValue) : formatCents(computedTotals.totalCents);

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

  const createDebitNoteFromBill = async () => {
    if (!bill || !canWrite) {
      return;
    }
    setCreatingDebitNote(true);
    try {
      const payload: DebitNoteCreateInput = {
        vendorId: bill.vendorId,
        billId: bill.id,
        debitNoteDate: new Date(),
        currency: bill.currency ?? orgCurrency,
        exchangeRate: Number(bill.exchangeRate ?? 1),
        lines: bill.lines.map((line) => {
          const description = (line.description ?? "").trim();
          const itemName = line.itemId ? itemsById.get(line.itemId)?.name : undefined;
          const safeDescription = description.length >= 2 ? description : itemName ?? "Line item";
          const qty = Number(line.qty ?? 0);
          const unitPrice = Number(line.unitPrice ?? 0);
          const discountAmount = Number(line.discountAmount ?? 0);
          return {
            itemId: line.itemId ?? undefined,
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
            expenseAccountId: line.expenseAccountId ?? undefined,
            description: safeDescription,
            qty: Number.isFinite(qty) ? qty : 0,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            discountAmount: Number.isFinite(discountAmount) ? discountAmount : 0,
            taxCodeId: line.taxCodeId ?? undefined,
          };
        }),
      };

      const created = await apiFetch<{ id: string }>("/debit-notes", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });
      toast({
        title: "Debit note created",
        description: bill.systemNumber ? `Draft created from bill ${bill.systemNumber}.` : "Draft created from bill.",
      });
      router.push(`/debit-notes/${created.id}`);
    } catch (err) {
      showErrorToast("Unable to create debit note", err);
    } finally {
      setCreatingDebitNote(false);
    }
  };

  const resolveLineAccountId = (item: ItemRecord) => {
    if (item.type === "INVENTORY") {
      return item.inventoryAccountId ?? "";
    }
    if (item.type === "FIXED_ASSET") {
      return item.fixedAssetAccountId ?? "";
    }
    return item.expenseAccountId ?? "";
  };

  const updateLineItem = (index: number, itemId: string) => {
    const item = itemsById.get(itemId);
    if (!item) {
      return;
    }
    const lineAccountId = resolveLineAccountId(item);
    form.setValue(`lines.${index}.itemId`, item.id);
    form.setValue(`lines.${index}.description`, item.name);
    form.setValue(`lines.${index}.expenseAccountId`, lineAccountId);
    const price = item.purchasePrice ?? 0;
    form.setValue(`lines.${index}.unitPrice`, Number(price));
    const resolvedUnitId = item.unitOfMeasureId ?? baseUnitId;
    if (resolvedUnitId) {
      form.setValue(`lines.${index}.unitOfMeasureId`, resolvedUnitId);
    }
    if (item.defaultTaxCodeId) {
      form.setValue(`lines.${index}.taxCodeId`, item.defaultTaxCodeId);
    }
    if (lineAccountId) {
      setRecentExpenseAccounts((prev) => {
        const next = [lineAccountId, ...prev.filter((id) => id !== lineAccountId)];
        return next.slice(0, 5);
      });
    }
  };

  const toggleFavoriteExpenseAccount = (accountId: string) => {
    setFavoriteExpenseAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    );
  };

  const handleItemCreated = (item: ItemQuickCreateRecord) => {
    setItems((prev) => {
      const merged = new Map(prev.map((entry) => [entry.id, entry]));
      merged.set(item.id, {
        id: item.id,
        name: item.name,
        type: item.type,
        purchasePrice: item.purchasePrice ?? null,
        incomeAccountId: item.incomeAccountId ?? null,
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
        purchasePrice: item.purchasePrice ?? null,
        incomeAccountId: item.incomeAccountId ?? null,
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
      const lineAccountId = resolveLineAccountId(item);
      form.setValue(`lines.${createItemTargetIndex}.itemId`, item.id);
      form.setValue(`lines.${createItemTargetIndex}.description`, item.name);
      form.setValue(`lines.${createItemTargetIndex}.expenseAccountId`, lineAccountId);
      form.setValue(`lines.${createItemTargetIndex}.unitPrice`, Number(item.purchasePrice ?? 0));
      const resolvedUnitId = item.unitOfMeasureId ?? baseUnitId;
      if (resolvedUnitId) {
        form.setValue(`lines.${createItemTargetIndex}.unitOfMeasureId`, resolvedUnitId);
      }
      if (item.defaultTaxCodeId) {
        form.setValue(`lines.${createItemTargetIndex}.taxCodeId`, item.defaultTaxCodeId);
      }
      if (lineAccountId) {
        setRecentExpenseAccounts((prev) => {
          const next = [lineAccountId, ...prev.filter((id) => id !== lineAccountId)];
          return next.slice(0, 5);
        });
      }
    }
    setCreateItemTargetIndex(null);
  };

  if (loading) {
    return (
      <div className="card">
        <PageHeader
          title="Bills"
          heading={isNew ? "New Bill" : "Bill"}
          description="Loading bill details."
          icon={<FileText className="h-5 w-5" />}
        />
        <p className="muted">Loading bill...</p>
      </div>
    );
  }

  if (isNew && !canWrite) {
    return (
      <div className="card">
        <PageHeader
          title="Bills"
          heading="New Bill"
          description="You do not have permission to create bills."
          icon={<FileText className="h-5 w-5" />}
        />
        <Button variant="secondary" onClick={() => router.push("/bills")}>
          Back to bills
        </Button>
      </div>
    );
  }

  const lastSavedAt = !isNew && bill?.updatedAt ? formatDateTime(bill.updatedAt) : null;
  const postedAt = !isNew && bill?.postedAt ? formatDateTime(bill.postedAt) : null;
  const headerHeading = isNew ? "New Bill" : bill?.systemNumber ?? bill?.billNumber ?? "Draft Bill";
  const headerDescription = isNew
    ? "Capture vendor bill details."
    : `${bill?.vendor?.name ?? "Vendor"} | ${bill?.currency ?? orgCurrency}`;
  const headerMeta =
    !isNew && (lastSavedAt || postedAt) ? (
      <p className="muted">
        {lastSavedAt ? `Last saved at ${lastSavedAt}` : null}
        {lastSavedAt && postedAt ? " - " : null}
        {postedAt ? `Posted at ${postedAt}` : null}
      </p>
    ) : null;
  const outstandingCents = bill
    ? toCents(bill.total ?? 0) - toCents(bill.amountPaid ?? 0)
    : 0n;
  const canUseCredits = !isNew && bill?.status === "POSTED" && canWrite && outstandingCents > 0n;

  return (
    <div className="card">
      <PageHeader
        title="Bills"
        heading={headerHeading}
        description={headerDescription}
        meta={headerMeta}
        icon={<FileText className="h-5 w-5" />}
        actions={!isNew ? <StatusChip status={bill?.status ?? "DRAFT"} /> : null}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={handleRetry} /> : null}
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
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const vendor = activeVendors.find((entry) => entry.id === value);
                    if (!vendor) {
                      setPaymentTermsValue("custom");
                      setDueDateManual(false);
                      return;
                    }
                    const nextTerms = String(Math.max(0, vendor.paymentTermsDays ?? 0));
                    setPaymentTermsValue(nextTerms);
                    setDueDateManual(false);
                    applyPaymentTerms(nextTerms);
                  }}
                  disabled={isReadOnly}
                >
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
                  onChange={(event) => {
                    const nextDate = event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined;
                    field.onChange(nextDate);
                    if (!nextDate) {
                      return;
                    }
                    if (!dueDateManual && paymentTermsValue !== "custom") {
                      applyPaymentTerms(paymentTermsValue, nextDate);
                    }
                  }}
                />
              )}
            />
            {renderFieldError(form.formState.errors.billDate?.message)}
          </label>
          <label>
            Payment Terms
            <Select
              value={paymentTermsValue}
              onValueChange={(value) => {
                setPaymentTermsValue(value);
                if (value === "custom") {
                  setDueDateManual(true);
                  return;
                }
                setDueDateManual(false);
                applyPaymentTerms(value);
              }}
              disabled={isReadOnly}
            >
              <SelectTrigger aria-label="Payment terms">
                <SelectValue placeholder="Select terms" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {paymentTermsValue === "custom" ? <p className="muted">Custom due date selected.</p> : null}
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
                  onChange={(event) => {
                    const nextDate = event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined;
                    field.onChange(nextDate);
                    if (!isReadOnly) {
                      setPaymentTermsValue("custom");
                      setDueDateManual(true);
                    }
                  }}
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
        <details
          className="card"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-semibold">Advanced</summary>
          <div style={{ height: 12 }} />
          <div className="form-grid">
            <label>
              Order Number / Reference
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
            UAE VAT is supported through tax codes. Select the appropriate tax code per line.
          </p>
          <div style={{ height: 8 }} />
        </details>

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
                                if (value) {
                                  updateLineItem(index, value);
                                }
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
                              Line Account
                              <Controller
                                control={form.control}
                                name={`lines.${index}.expenseAccountId`}
                                render={({ field }) => (
                                  <AccountCombobox
                                    value={field.value ?? ""}
                                    selectedLabel={accounts.find((account) => account.id === field.value)?.name}
                                    options={lineAccountOptions}
                                    onValueChange={(value) => {
                                      field.onChange(value);
                                      setRecentExpenseAccounts((prev) => {
                                        const next = [value, ...prev.filter((id) => id !== value)];
                                        return next.slice(0, 5);
                                      });
                                    }}
                                    favoriteIds={favoriteExpenseAccounts}
                                    recentIds={recentExpenseAccounts}
                                    onToggleFavorite={toggleFavoriteExpenseAccount}
                                    disabled={isReadOnly}
                                    placeholder="Select account"
                                  />
                                )}
                              />
                              {renderFieldError(form.formState.errors.lines?.[index]?.expenseAccountId?.message)}
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                unitOfMeasureId: baseUnitId || "",
                taxCodeId: "",
              } as BillLineCreateInput)
            }
            disabled={isReadOnly}
          >
            Add Line
          </Button>
          <Dialog open={bulkAddOpen} onOpenChange={setBulkAddOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary" disabled={isReadOnly}>
                Add Items
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add items in bulk</DialogTitle>
              </DialogHeader>
              <div style={{ display: "grid", gap: 12 }}>
                <Input
                  placeholder="Search items"
                  value={bulkItemSearch}
                  onChange={(event) => setBulkItemSearch(event.target.value)}
                />
                {bulkItemLoading ? <p className="muted">Loading items...</p> : null}
                {!bulkItemLoading && bulkItemResults.length === 0 ? (
                  <p className="muted">No items found.</p>
                ) : null}
                {bulkItemResults.length > 0 ? (
                  <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                    {bulkItemResults.map((item) => {
                      const checked = bulkSelectedIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setBulkSelectedIds((prev) =>
                                prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
                              )
                            }
                          />
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{item.name}</span>
                            <span className="muted">{item.sku ? `SKU ${item.sku}` : item.type}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setBulkAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      const selectedItems = bulkItemResults.filter((item) => bulkSelectedIds.includes(item.id));
                      if (selectedItems.length === 0) {
                        setBulkAddOpen(false);
                        return;
                      }
                      const newLines = selectedItems.map((item) => ({
                        expenseAccountId: resolveLineAccountId(item),
                        itemId: item.id,
                        description: item.name,
                        qty: 1,
                        unitPrice: Number(item.purchasePrice ?? 0),
                        discountAmount: 0,
                        unitOfMeasureId: item.unitOfMeasureId ?? baseUnitId ?? "",
                        taxCodeId: item.defaultTaxCodeId ?? "",
                      })) as BillLineCreateInput[];
                      const firstLine = form.getValues("lines.0");
                      const isEmptyFirstLine =
                        fields.length === 1 &&
                        !firstLine?.itemId &&
                        !(firstLine?.description ?? "").trim();
                      if (isEmptyFirstLine) {
                        replace(newLines);
                      } else {
                        append(newLines);
                      }
                      setBulkSelectedIds([]);
                      setBulkAddOpen(false);
                    }}
                    disabled={bulkSelectedIds.length === 0}
                  >
                    Add Selected
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

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
            <strong>Attachments</strong>
            <p className="muted">Upload receipts or paste file links for this bill.</p>
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
                  <p className="muted">Use a link if you don’t want to upload a file.</p>
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
                  <Button
                    type="button"
                    disabled={attachmentSaving}
                    onClick={uploadAttachment}
                  >
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
        {!attachmentsLoading && attachments.length === 0 ? (
          <p className="muted">No attachments yet.</p>
        ) : null}
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
                    <TableCell>
                      {attachment.createdAt ? formatDateTime(attachment.createdAt) : "-"}
                    </TableCell>
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
                <LockDateWarning lockDate={lockDate} docDate={billDateValue} actionLabel="posting" />
                <PostImpactSummary mode="post" ledgerLines={ledgerPreview} currency={orgCurrency} />
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
                <LockDateWarning lockDate={lockDate} docDate={billDateValue} actionLabel="voiding" />
                <PostImpactSummary mode="void" />
                {voidError ? <ErrorBanner error={voidError} /> : null}
                <div style={{ height: 12 }} />
                <Button type="button" variant="destructive" onClick={() => voidBill()} disabled={isLocked || voiding}>
                  {voiding ? "Voiding..." : "Confirm Void"}
                </Button>
              </DialogContent>
            </Dialog>
          ) : null}
          {canUseCredits ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/debit-notes?vendorId=${bill?.vendorId}`)}
            >
              Use Credits
            </Button>
          ) : null}
          {!isNew && bill?.status === "POSTED" && canWrite ? (
            <Button type="button" variant="secondary" onClick={createDebitNoteFromBill} disabled={creatingDebitNote}>
              {creatingDebitNote ? "Creating..." : "Create Debit Note"}
            </Button>
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
        onCreated={handleItemCreated}
      />
    </div>
  );
}
