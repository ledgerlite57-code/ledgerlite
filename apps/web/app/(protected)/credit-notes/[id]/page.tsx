"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Permissions, type CreditNoteApplyInput, type PaginatedResponse } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatDateTime, formatMoney } from "../../../../src/lib/format";
import { normalizeError } from "../../../../src/lib/errors";
import { formatBigIntDecimal, toCents } from "../../../../src/lib/money";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { Input } from "../../../../src/lib/ui-input";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { PostImpactSummary } from "../../../../src/lib/ui-post-impact-summary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";
import { ValidationSummary } from "../../../../src/lib/ui-validation-summary";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type CreditNoteLineRecord = {
  id: string;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  lineTax: string | number;
  lineTotal: string | number;
  item?: { id: string; name: string } | null;
  taxCode?: { id: string; name: string } | null;
};

type InvoiceRecord = {
  id: string;
  number?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
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

type CreditNoteRefundRecord = {
  id: string;
  refundDate: string;
  amount: string | number;
  reference?: string | null;
  memo?: string | null;
  createdAt?: string | null;
  bankAccount?: { id: string; name: string } | null;
  paymentAccount?: { id: string; name: string; subtype?: string | null } | null;
};

type BankAccountRecord = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
  glAccount?: { id: string; subtype?: string | null } | null;
};

type AccountRecord = {
  id: string;
  name: string;
  subtype?: string | null;
  isActive?: boolean;
};

type CreditNoteRefundFormInput = {
  sourceId: string;
  refundDate: Date;
  amount: number;
};

type CreditNoteRecord = {
  id: string;
  number?: string | null;
  status: string;
  returnInventory?: boolean;
  customerId: string;
  invoiceId?: string | null;
  creditNoteDate: string;
  currency: string;
  exchangeRate?: string | number | null;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  reference?: string | null;
  notes?: string | null;
  postedAt?: string | null;
  voidedAt?: string | null;
  updatedAt?: string | null;
  customer?: { id: string; name: string } | null;
  lines: CreditNoteLineRecord[];
  allocations?: AllocationRecord[];
  refunds?: CreditNoteRefundRecord[];
};

type OrgSettingsResponse = {
  baseCurrency?: string;
  orgSettings?: { lockDate?: string | null };
};

type RefundSourceOption = {
  id: string;
  label: string;
  bankAccountId?: string;
  paymentAccountId?: string;
  currency?: string | null;
};

const computeOutstanding = (invoice: InvoiceRecord) => {
  const totalCents = toCents(invoice.total ?? 0);
  const paidCents = toCents(invoice.amountPaid ?? 0);
  const remaining = totalCents - paidCents;
  return remaining > 0n ? remaining : 0n;
};

const formatCents = (value: bigint, currency: string) => formatMoney(formatBigIntDecimal(value, 2), currency);
const unwrapList = <T,>(value: PaginatedResponse<T> | T[]) => (Array.isArray(value) ? value : value.data ?? []);

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const creditNoteId = params?.id ?? "";
  const { hasPermission } = usePermissions();
  const canPost = hasPermission(Permissions.INVOICE_POST);

  const [creditNote, setCreditNote] = useState<CreditNoteRecord | null>(null);
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<unknown>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [cashAccounts, setCashAccounts] = useState<AccountRecord[]>([]);
  const [applyError, setApplyError] = useState<unknown>(null);
  const [applying, setApplying] = useState(false);
  const [applyAttempted, setApplyAttempted] = useState(false);
  const [refundError, setRefundError] = useState<unknown>(null);
  const [refunding, setRefunding] = useState(false);
  const refundSectionId = "credit-note-refund-section";

  const applyForm = useForm<CreditNoteApplyInput>({
    defaultValues: {
      allocations: [],
    },
  });
  const refundForm = useForm<CreditNoteRefundFormInput>({
    defaultValues: {
      sourceId: "",
      refundDate: new Date(),
      amount: 0,
    },
  });

  const {
    fields: allocationFields,
    append: appendAllocation,
    remove: removeAllocation,
    replace: replaceAllocations,
  } = useFieldArray({
    control: applyForm.control,
    name: "allocations",
  });

  const loadCreditNote = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, record] = await Promise.all([
        apiFetch<OrgSettingsResponse>("/orgs/current"),
        apiFetch<CreditNoteRecord>(`/credit-notes/${creditNoteId}`),
      ]);
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setCreditNote(record);
    } catch (err) {
      setActionError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to load credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setLoading(false);
    }
  }, [creditNoteId]);

  useEffect(() => {
    if (!creditNoteId) {
      return;
    }
    loadCreditNote();
  }, [creditNoteId, loadCreditNote]);

  useEffect(() => {
    if (!creditNote) {
      return;
    }
    const nextAllocations =
      creditNote.allocations?.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        amount: Number(allocation.amount ?? 0),
      })) ?? [];
    replaceAllocations(nextAllocations);
    setApplyAttempted(false);
  }, [creditNote, replaceAllocations]);

  useEffect(() => {
    if (!creditNote?.customerId) {
      setInvoices([]);
      return;
    }
    let active = true;
    const loadInvoices = async () => {
      try {
        setApplyError(null);
        const result = await apiFetch<PaginatedResponse<InvoiceRecord>>(
          `/invoices?customerId=${creditNote.customerId}&status=POSTED&page=1&pageSize=100`,
        );
        if (!active) {
          return;
        }
        const allocatedInvoices =
          creditNote.allocations
            ?.map((allocation) => allocation.invoice)
            .filter((invoice): invoice is InvoiceRecord => Boolean(invoice)) ?? [];
        const merged = mergeInvoices(result.data, allocatedInvoices);
        setInvoices(merged);
      } catch (err) {
        if (active) {
          setApplyError(err);
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [creditNote?.allocations, creditNote?.customerId]);

  useEffect(() => {
    let active = true;
    const loadRefundSources = async () => {
      try {
        const [bankResult, accountResult] = await Promise.all([
          apiFetch<PaginatedResponse<BankAccountRecord> | BankAccountRecord[]>(
            "/bank-accounts?page=1&pageSize=100&isActive=true",
          ),
          apiFetch<PaginatedResponse<AccountRecord> | AccountRecord[]>(
            "/accounts?page=1&pageSize=100&isActive=true&subtype=CASH",
          ),
        ]);
        if (!active) {
          return;
        }
        setBankAccounts(unwrapList(bankResult));
        setCashAccounts(unwrapList(accountResult));
      } catch {
        if (active) {
          setBankAccounts([]);
          setCashAccounts([]);
        }
      }
    };
    loadRefundSources();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!creditNote) {
      return;
    }
    const defaultDate = creditNote.creditNoteDate ? new Date(creditNote.creditNoteDate) : new Date();
    refundForm.setValue("refundDate", defaultDate);
  }, [creditNote, refundForm]);

  const handlePost = async () => {
    if (!creditNote) {
      return;
    }
    setPosting(true);
    try {
      setPostError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setPostDialogOpen(false);
      toast({ title: "Credit note posted", description: "Ledger entries were created." });
    } catch (err) {
      setPostError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to post credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!creditNote) {
      return;
    }
    setVoiding(true);
    try {
      setVoidError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setVoidDialogOpen(false);
      toast({ title: "Credit note voided", description: "A reversal entry has been created." });
    } catch (err) {
      setVoidError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to void credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setVoiding(false);
    }
  };

  const allocationValues = applyForm.watch("allocations");
  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const selectedInvoiceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const allocation of allocationValues ?? []) {
      if (allocation.invoiceId) {
        ids.add(allocation.invoiceId);
      }
    }
    return ids;
  }, [allocationValues]);
  const linkedInvoiceId = creditNote?.invoiceId ?? null;
  const scopedInvoices = useMemo(() => {
    if (!linkedInvoiceId) {
      return invoices;
    }
    return invoices.filter((invoice) => invoice.id === linkedInvoiceId || selectedInvoiceIds.has(invoice.id));
  }, [invoices, linkedInvoiceId, selectedInvoiceIds]);
  const availableInvoices = useMemo(() => {
    return scopedInvoices.filter((invoice) => {
      const outstanding = computeOutstanding(invoice);
      return outstanding > 0n || selectedInvoiceIds.has(invoice.id);
    });
  }, [scopedInvoices, selectedInvoiceIds]);
  const creditTotalCents = toCents(creditNote?.total ?? 0);
  const appliedTotalCents = useMemo(() => {
    return (creditNote?.allocations ?? []).reduce((sum, allocation) => sum + toCents(allocation.amount ?? 0), 0n);
  }, [creditNote?.allocations]);
  const refundedTotalCents = useMemo(() => {
    return (creditNote?.refunds ?? []).reduce((sum, refund) => sum + toCents(refund.amount ?? 0), 0n);
  }, [creditNote?.refunds]);
  const remainingCreditCents = creditTotalCents - appliedTotalCents - refundedTotalCents;
  const currencyValue = creditNote?.currency ?? "AED";
  const allocationHint = !creditNote?.customerId
    ? "Select a customer to load invoices."
    : linkedInvoiceId && scopedInvoices.length === 0
      ? "The linked invoice is not available for allocation."
      : linkedInvoiceId && availableInvoices.length === 0
        ? "The linked invoice has no outstanding balance to apply."
        : availableInvoices.length === 0
          ? "No posted invoices with outstanding balance are available for this customer."
          : null;
  const existingAllocationsByInvoice = useMemo(() => {
    return new Map((creditNote?.allocations ?? []).map((allocation) => [allocation.invoiceId, allocation]));
  }, [creditNote?.allocations]);
  const existingRefunds = useMemo(() => creditNote?.refunds ?? [], [creditNote?.refunds]);
  const refundSources = useMemo<RefundSourceOption[]>(() => {
    const bankOptions = bankAccounts
      .filter((account) => account.isActive)
      .map((account) => ({
        id: `bank:${account.id}`,
        label: account.name,
        bankAccountId: account.id,
        paymentAccountId: account.glAccount?.id,
        currency: account.currency,
      }));
    const cashOptions = cashAccounts
      .filter((account) => (account.subtype ?? "").toUpperCase() === "CASH")
      .map((account) => ({
        id: `cash:${account.id}`,
        label: `${account.name} (Cash)`,
        paymentAccountId: account.id,
        currency: null,
      }));
    return [...bankOptions, ...cashOptions];
  }, [bankAccounts, cashAccounts]);
  const selectedRefundSourceId = refundForm.watch("sourceId");
  const selectedRefundSource = useMemo(
    () => refundSources.find((source) => source.id === selectedRefundSourceId),
    [refundSources, selectedRefundSourceId],
  );
  useEffect(() => {
    if (refundSources.length === 0) {
      refundForm.setValue("sourceId", "");
      return;
    }
    if (!selectedRefundSourceId || !refundSources.some((source) => source.id === selectedRefundSourceId)) {
      refundForm.setValue("sourceId", refundSources[0]?.id ?? "");
    }
  }, [refundForm, refundSources, selectedRefundSourceId]);
  useEffect(() => {
    const currentAmount = Number(refundForm.getValues("amount") ?? 0);
    if (currentAmount > 0) {
      return;
    }
    if (remainingCreditCents <= 0n) {
      refundForm.setValue("amount", 0);
      return;
    }
    refundForm.setValue("amount", Number(formatBigIntDecimal(remainingCreditCents, 2)));
  }, [refundForm, remainingCreditCents]);

  const scrollToRefundSection = () => {
    const section = document.getElementById(refundSectionId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const updateAllocationInvoice = (index: number, invoiceId: string) => {
    applyForm.setValue(`allocations.${index}.invoiceId`, invoiceId);
    const invoice = invoiceMap.get(invoiceId);
    if (!invoice) {
      return;
    }
    const currentAmount = toCents(applyForm.getValues(`allocations.${index}.amount`) ?? 0);
    if (currentAmount !== 0n) {
      return;
    }
    const outstanding = computeOutstanding(invoice);
    if (outstanding <= 0n) {
      return;
    }
    const otherAllocations = (applyForm.getValues("allocations") ?? []).reduce((sum, allocation, idx) => {
      if (idx === index) {
        return sum;
      }
      return sum + toCents(allocation.amount ?? 0);
    }, 0n);
    const remaining = creditTotalCents - otherAllocations;
    const nextAmount = remaining > 0n ? (remaining < outstanding ? remaining : outstanding) : 0n;
    if (nextAmount > 0n) {
      applyForm.setValue(`allocations.${index}.amount`, Number(formatBigIntDecimal(nextAmount, 2)));
    }
  };

  const buildAutoAllocations = useCallback((): CreditNoteApplyInput["allocations"] => {
    let remaining = creditTotalCents;
    const allocations: CreditNoteApplyInput["allocations"] = [];
    const sorted = [...availableInvoices].sort(
      (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
    );
    for (const invoice of sorted) {
      if (remaining <= 0n) {
        break;
      }
      const outstanding = computeOutstanding(invoice);
      if (outstanding <= 0n) {
        continue;
      }
      const amount = remaining < outstanding ? remaining : outstanding;
      allocations.push({
        invoiceId: invoice.id,
        amount: Number(formatBigIntDecimal(amount, 2)),
      });
      remaining -= amount;
    }
    return allocations;
  }, [availableInvoices, creditTotalCents]);

  const handleAutoApply = () => {
    if (!creditNote || creditNote.status !== "POSTED") {
      return;
    }
    const allocations = buildAutoAllocations();
    replaceAllocations(allocations);
  };

  const handlePostAndApply = async () => {
    if (!creditNote) {
      return;
    }

    setPosting(true);
    try {
      setPostError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setPostDialogOpen(false);

      const allocations = buildAutoAllocations();
      if (allocations.length === 0) {
        toast({
          title: "Credit note posted",
          description: "No eligible posted invoices were available for auto-apply.",
        });
        return;
      }

      setApplying(true);
      setApplyError(null);
      try {
        await apiFetch(`/credit-notes/${updated.id}/apply`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ allocations }),
        });
        await loadCreditNote();
        toast({
          title: "Credit note posted and applied",
          description: "Invoice balances were updated.",
        });
      } catch (err) {
        setApplyError(err);
        const normalized = normalizeError(err);
        toast({
          variant: "destructive",
          title: "Credit note posted, but auto-apply failed",
          description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
        });
      } finally {
        setApplying(false);
      }
    } catch (err) {
      setPostError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to post credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setPosting(false);
    }
  };

  const handleApply = async () => {
    if (!creditNote) {
      return;
    }
    setApplyAttempted(true);
    applyForm.clearErrors();
    setApplyError(null);
    if (availableInvoices.length === 0) {
      setApplyError(
        linkedInvoiceId
          ? "The linked invoice has no outstanding balance to apply."
          : "No posted invoices with outstanding balance are available to apply this credit.",
      );
      return;
    }
    const rawAllocations = applyForm.getValues("allocations") ?? [];
    const indexedAllocations = rawAllocations.map((allocation, index) => ({
      index,
      invoiceId: allocation.invoiceId,
      amount: Number(allocation.amount ?? 0),
    }));
    let hasFieldErrors = false;
    for (const allocation of indexedAllocations) {
      const hasInvoice = Boolean(allocation.invoiceId);
      const hasAmount = allocation.amount > 0;
      if (!hasInvoice && hasAmount) {
        applyForm.setError(`allocations.${allocation.index}.invoiceId` as `allocations.${number}.invoiceId`, {
          type: "manual",
          message: "Select an invoice for this amount.",
        });
        hasFieldErrors = true;
      }
      if (hasInvoice && !hasAmount) {
        applyForm.setError(`allocations.${allocation.index}.amount` as `allocations.${number}.amount`, {
          type: "manual",
          message: "Enter an amount greater than zero.",
        });
        hasFieldErrors = true;
      }
    }

    const allocations = indexedAllocations.filter((allocation) => allocation.invoiceId && allocation.amount > 0);
    if (hasFieldErrors) {
      setApplyError("Fix the highlighted allocations before applying.");
      return;
    }
    if (allocations.length === 0) {
      setApplyError("Add at least one allocation before applying.");
      return;
    }

    let total = 0n;
    for (const allocation of allocations) {
      const invoice = invoiceMap.get(allocation.invoiceId);
      if (!invoice) {
        applyForm.setError(`allocations.${allocation.index}.invoiceId` as `allocations.${number}.invoiceId`, {
          type: "manual",
          message: "Selected invoice could not be found.",
        });
        setApplyError("One or more invoices are invalid.");
        return;
      }
      const outstanding = computeOutstanding(invoice);
      const amountCents = toCents(allocation.amount);
      total += amountCents;
      if (amountCents > outstanding) {
        applyForm.setError(`allocations.${allocation.index}.amount` as `allocations.${number}.amount`, {
          type: "manual",
          message: "Amount exceeds invoice outstanding.",
        });
        setApplyError(`Allocation exceeds outstanding for invoice ${invoice.number ?? "Invoice"}.`);
        return;
      }
    }
    if (total > creditTotalCents) {
      setApplyError("Applied amount exceeds credit note total.");
      return;
    }

    setApplying(true);
    setApplyError(null);
    try {
      await apiFetch(`/credit-notes/${creditNote.id}/apply`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          allocations: allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
          })),
        }),
      });
      await loadCreditNote();
      toast({ title: "Allocations applied", description: "Invoice balances were updated." });
    } catch (err) {
      setApplyError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to apply credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRefund = async () => {
    if (!creditNote || creditNote.status !== "POSTED") {
      return;
    }
    if (remainingCreditCents <= 0n) {
      setRefundError("No refundable credit balance is available.");
      return;
    }
    const values = refundForm.getValues();
    const source = refundSources.find((entry) => entry.id === values.sourceId);
    if (!source) {
      setRefundError("Select a refund account.");
      return;
    }
    const amountCents = toCents(values.amount ?? 0);
    if (amountCents <= 0n) {
      setRefundError("Enter a refund amount greater than zero.");
      return;
    }
    if (amountCents > remainingCreditCents) {
      setRefundError("Refund amount exceeds available credit balance.");
      return;
    }

    setRefunding(true);
    setRefundError(null);
    try {
      await apiFetch(`/credit-notes/${creditNote.id}/refund`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          bankAccountId: source.bankAccountId,
          paymentAccountId: source.paymentAccountId,
          refundDate: values.refundDate?.toISOString?.() ?? new Date().toISOString(),
          amount: values.amount,
        }),
      });
      await loadCreditNote();
      refundForm.setValue("amount", 0);
      toast({ title: "Refund recorded", description: "Customer credit balance and ledger entries were updated." });
    } catch (err) {
      setRefundError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to record refund",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setRefunding(false);
    }
  };

  const handleUnapply = async (invoiceId?: string) => {
    if (!creditNote) {
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      await apiFetch(`/credit-notes/${creditNote.id}/unapply`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(invoiceId ? { invoiceId } : {}),
      });
      await loadCreditNote();
      toast({ title: "Allocation removed", description: "Invoice balances were updated." });
    } catch (err) {
      setApplyError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to remove allocation",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRemoveAllocation = async (index: number, invoiceId: string) => {
    if (existingAllocationsByInvoice.has(invoiceId)) {
      await handleUnapply(invoiceId);
      return;
    }
    removeAllocation(index);
  };

  const lineRows = useMemo(() => creditNote?.lines ?? [], [creditNote?.lines]);

  if (loading) {
    return <div className="card">Loading credit note...</div>;
  }

  if (!creditNote) {
    const fallbackMessage = actionError ? normalizeError(actionError).message : "Credit note not found.";
    return (
      <div className="card">
        <PageHeader title="Credit Notes" heading="Credit Note" description={fallbackMessage} icon={<FileText className="h-5 w-5" />} />
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>Back to Credit Notes</Button>
      </div>
    );
  }

  const isPosted = creditNote.status === "POSTED";
  const isDraft = creditNote.status === "DRAFT";
  const canApply = isPosted && canPost;
  const hasExistingAllocations = (creditNote.allocations?.length ?? 0) > 0;
  const hasAvailableInvoices = availableInvoices.length > 0;
  const showAllocationTable = hasExistingAllocations || hasAvailableInvoices;
  const creditNoteDate = creditNote.creditNoteDate ? new Date(creditNote.creditNoteDate) : null;
  const isLocked = isDateLocked(lockDate, creditNoteDate ?? undefined);
  const lastSavedAt = creditNote.updatedAt ? formatDateTime(creditNote.updatedAt) : null;
  const postedAt = creditNote.postedAt ? formatDateTime(creditNote.postedAt) : null;
  const voidedAt = creditNote.voidedAt ? formatDateTime(creditNote.voidedAt) : null;

  return (
    <div className="card">
      <PageHeader
        title="Credit Notes"
        heading={creditNote.number ?? "Credit Note"}
        description={`${creditNote.customer?.name ?? "Customer"} | ${currencyValue}`}
        icon={<FileText className="h-5 w-5" />}
        meta={
          <>
            {lastSavedAt ? <p className="muted">Last saved at {lastSavedAt}</p> : null}
            {postedAt ? <p className="muted">Posted at {postedAt}</p> : null}
            {voidedAt ? <p className="muted">Voided at {voidedAt}</p> : null}
          </>
        }
        actions={<StatusChip status={creditNote.status} />}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={() => loadCreditNote()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="posting and voiding" />

      <div className="form-grid">
        <div>
          <p className="muted">Credit Note Date</p>
          <p>{formatDate(creditNote.creditNoteDate)}</p>
        </div>
        <div>
          <p className="muted">Customer</p>
          <p>{creditNote.customer?.name ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Credit Mode</p>
          <p>{creditNote.returnInventory === false ? "Financial credit only" : "Return to inventory"}</p>
        </div>
        <div>
          <p className="muted">Subtotal</p>
          <p>{formatMoney(creditNote.subTotal, creditNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Tax</p>
          <p>{formatMoney(creditNote.taxTotal, creditNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Total</p>
          <p>{formatMoney(creditNote.total, creditNote.currency)}</p>
        </div>
      </div>

      {creditNote.notes ? (
        <>
          <div style={{ height: 12 }} />
          <p className="muted">Notes</p>
          <p>{creditNote.notes}</p>
        </>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <h2>Line items</h2>
      </div>
      {lineRows.length === 0 ? <p className="muted">No line items found.</p> : null}
      {lineRows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineRows.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.item?.name ?? "-"}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell>{line.qty}</TableCell>
                <TableCell>{formatMoney(line.unitPrice, creditNote.currency)}</TableCell>
                <TableCell>{formatMoney(line.discountAmount ?? 0, creditNote.currency)}</TableCell>
                <TableCell>
                  {line.taxCode?.name
                    ? `${line.taxCode.name} (${formatMoney(line.lineTax ?? 0, creditNote.currency)})`
                    : formatMoney(line.lineTax ?? 0, creditNote.currency)}
                </TableCell>
                <TableCell>{formatMoney(line.lineTotal ?? 0, creditNote.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <div>
          <h2>Credit actions</h2>
          <p className="muted">Apply credit to invoices or refund customer balance.</p>
        </div>
      </div>
      <div className="form-grid">
        <div>
          <p className="muted">Credited</p>
          <p>{formatCents(creditTotalCents, currencyValue)}</p>
        </div>
        <div>
          <p className="muted">Applied</p>
          <p>{formatCents(appliedTotalCents, currencyValue)}</p>
        </div>
        <div>
          <p className="muted">Refunded</p>
          <p>{formatCents(refundedTotalCents, currencyValue)}</p>
        </div>
        <div>
          <p className="muted">Remaining</p>
          <p className={remainingCreditCents < 0n ? "form-error" : undefined}>
            {formatCents(remainingCreditCents < 0n ? -remainingCreditCents : remainingCreditCents, currencyValue)}
          </p>
        </div>
      </div>
      {!isPosted ? <p className="muted">Post this sales return before applying or refunding credit.</p> : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <div>
          <h3>Apply to invoices</h3>
          <p className="muted">Use this when reducing outstanding receivables.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {canApply ? (
            <Button type="button" variant="secondary" onClick={handleAutoApply} disabled={!hasAvailableInvoices}>
              Apply remaining
            </Button>
          ) : null}
          {canApply && hasExistingAllocations ? (
            <Button type="button" variant="ghost" onClick={() => handleUnapply()}>
              Unapply all
            </Button>
          ) : null}
        </div>
      </div>
      {applyError ? <ErrorBanner error={applyError} /> : null}
      {applyAttempted ? <ValidationSummary errors={applyForm.formState.errors} /> : null}
      {showAllocationTable ? (
        <>
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
              {allocationFields.map((field, index) => {
                const invoiceId = applyForm.getValues(`allocations.${index}.invoiceId`);
                const selectedInvoice = invoiceMap.get(invoiceId);
                const outstanding = selectedInvoice ? computeOutstanding(selectedInvoice) : 0n;
                const allocationCents = toCents(applyForm.getValues(`allocations.${index}.amount`) ?? 0);
                const overAllocated = selectedInvoice ? allocationCents > outstanding : false;
                const overBy = overAllocated ? allocationCents - outstanding : 0n;

                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Controller
                        control={applyForm.control}
                        name={`allocations.${index}.invoiceId`}
                        render={({ field }) => (
                          <Select
                            value={field.value ?? ""}
                            onValueChange={(value) => {
                              field.onChange(value);
                              updateAllocationInvoice(index, value);
                            }}
                            disabled={!canApply || !hasAvailableInvoices}
                          >
                            <SelectTrigger aria-label="Invoice">
                              <SelectValue placeholder="Select invoice" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableInvoices.map((invoice) => (
                                <SelectItem key={invoice.id} value={invoice.id}>
                                  {invoice.number ?? "Invoice"} - {formatMoney(invoice.total, invoice.currency)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {applyForm.formState.errors.allocations?.[index]?.invoiceId?.message ? (
                        <p className="form-error">{applyForm.formState.errors.allocations[index]?.invoiceId?.message}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{selectedInvoice ? formatCents(outstanding, currencyValue) : "-"}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={!canApply || !hasAvailableInvoices}
                        {...applyForm.register(`allocations.${index}.amount`)}
                      />
                      {overAllocated ? <p className="form-error">Over by {formatCents(overBy, currencyValue)}</p> : null}
                      {applyForm.formState.errors.allocations?.[index]?.amount?.message ? (
                        <p className="form-error">{applyForm.formState.errors.allocations[index]?.amount?.message}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {canApply ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAllocation(index, invoiceId)}
                          disabled={applying}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {canApply ? (
            <>
              <div style={{ height: 12 }} />
              <div className="form-action-bar">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => appendAllocation({ invoiceId: "", amount: 0 })}
                  disabled={applying || !hasAvailableInvoices}
                >
                  Add allocation
                </Button>
                <Button type="button" onClick={handleApply} disabled={applying || !hasAvailableInvoices}>
                  {applying ? "Applying..." : "Apply allocations"}
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p className="muted">
            No posted invoices with outstanding balance are available for this customer. Use `Refund to customer` to
            settle this credit.
          </p>
          {canApply && remainingCreditCents > 0n ? (
            <>
              <div style={{ height: 8 }} />
              <Button type="button" variant="secondary" onClick={scrollToRefundSection}>
                Go to refund
              </Button>
            </>
          ) : null}
        </>
      )}

      <div style={{ height: 16 }} />
      <div id={refundSectionId} className="section-header">
        <div>
          <h3>Refund to customer</h3>
          <p className="muted">Use this when paying credit back through bank or cash.</p>
        </div>
      </div>
      {refundError ? <ErrorBanner error={refundError} /> : null}
      {isPosted ? (
        <>
          <div className="form-grid">
            <label>
              Refund From *
              <Controller
                control={refundForm.control}
                name="sourceId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={refunding || refundSources.length === 0}>
                    <SelectTrigger aria-label="Refund source">
                      <SelectValue placeholder="Select bank or cash account" />
                    </SelectTrigger>
                    <SelectContent>
                      {refundSources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </label>
            <label>
              Refund Date *
              <Controller
                control={refundForm.control}
                name="refundDate"
                render={({ field }) => (
                  <Input
                    type="date"
                    value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""}
                    onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                    disabled={refunding}
                  />
                )}
              />
            </label>
            <label>
              Amount *
              <Input
                type="number"
                step="0.01"
                min="0"
                disabled={refunding || remainingCreditCents <= 0n}
                {...refundForm.register("amount", { valueAsNumber: true })}
              />
              {selectedRefundSource?.currency ? (
                <p className="muted">Account currency: {selectedRefundSource.currency}</p>
              ) : null}
            </label>
          </div>
          <div style={{ height: 12 }} />
          <div className="form-action-bar">
            <Button
              type="button"
              onClick={handleRefund}
              disabled={refunding || remainingCreditCents <= 0n || !selectedRefundSource}
            >
              {refunding ? "Refunding..." : "Refund customer"}
            </Button>
          </div>
          {existingRefunds.length > 0 ? (
            <>
              <div style={{ height: 12 }} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {existingRefunds.map((refund) => (
                    <TableRow key={refund.id}>
                      <TableCell>{formatDate(refund.refundDate)}</TableCell>
                      <TableCell>{refund.bankAccount?.name ?? refund.paymentAccount?.name ?? "-"}</TableCell>
                      <TableCell>{formatMoney(refund.amount, currencyValue)}</TableCell>
                      <TableCell>{refund.createdAt ? formatDateTime(refund.createdAt) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : null}
        </>
      ) : (
        <p className="muted">Post this credit note before recording a refund.</p>
      )}

      <div style={{ height: 16 }} />
      <div className="form-action-bar">
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>Back to Credit Notes</Button>
        {isDraft && canPost ? (
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLocked}>Post Credit Note</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post credit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="posting" />
              <PostImpactSummary mode="post" />
              {postError ? <ErrorBanner error={postError} /> : null}
              <div style={{ height: 12 }} />
              <div className="form-action-bar">
                <Button type="button" onClick={handlePost} disabled={posting || isLocked}>
                  {posting ? "Posting..." : "Confirm Post"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePostAndApply}
                  disabled={posting || isLocked || availableInvoices.length === 0}
                >
                  {posting ? "Processing..." : "Post & Apply"}
                </Button>
              </div>
              {availableInvoices.length === 0 ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  No eligible posted invoices found for this customer.
                </p>
              ) : null}
            </DialogContent>
          </Dialog>
        ) : null}
        {isPosted && canPost ? (
          <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isLocked || voiding}>
                Void Credit Note
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void credit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="voiding" />
              <PostImpactSummary mode="void" />
              {voidError ? <ErrorBanner error={voidError} /> : null}
              <div style={{ height: 12 }} />
              <Button type="button" variant="destructive" onClick={handleVoid} disabled={voiding || isLocked}>
                {voiding ? "Voiding..." : "Confirm Void"}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

function mergeInvoices(existing: InvoiceRecord[], incoming: InvoiceRecord[]) {
  const map = new Map(existing.map((invoice) => [invoice.id, invoice]));
  for (const invoice of incoming) {
    if (!invoice) {
      continue;
    }
    map.set(invoice.id, invoice);
  }
  return Array.from(map.values());
}
