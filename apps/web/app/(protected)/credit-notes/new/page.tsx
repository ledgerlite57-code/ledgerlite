"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Permissions, type CreditNoteCreateInput, type PaginatedResponse } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type CustomerRecord = { id: string; name: string; isActive: boolean };

type InvoiceListRecord = {
  id: string;
  number?: string | null;
  status: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  total: string | number;
  customer?: { id: string; name: string } | null;
};

type InvoiceDetailRecord = {
  id: string;
  number?: string | null;
  customerId: string;
  invoiceDate: string;
  currency: string;
  exchangeRate?: string | number | null;
  total: string | number;
  lines: Array<{
    itemId?: string | null;
    incomeAccountId?: string | null;
    description: string;
    qty: string | number;
    unitPrice: string | number;
    discountAmount?: string | number | null;
    unitOfMeasureId?: string | null;
    taxCodeId?: string | null;
  }>;
};

const mergeInvoices = (existing: InvoiceListRecord[], incoming: InvoiceListRecord[]) => {
  const map = new Map(existing.map((invoice) => [invoice.id, invoice]));
  for (const invoice of incoming) {
    map.set(invoice.id, invoice);
  }
  return Array.from(map.values());
};

export default function NewCreditNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillInvoiceId = searchParams.get("invoiceId") ?? "";
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.INVOICE_WRITE);

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListRecord[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(prefillInvoiceId);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<InvoiceDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [orgCurrency, setOrgCurrency] = useState("AED");

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  const loadReferences = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, customerResult] = await Promise.all([
        apiFetch<{ baseCurrency?: string }>("/orgs/current"),
        apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
      ]);
      setOrgCurrency(org.baseCurrency ?? "AED");
      setCustomers(customerResult.data);
    } catch (err) {
      setActionError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    if (!selectedInvoiceId) {
      setSelectedInvoiceDetail(null);
      return;
    }
    let active = true;
    const loadInvoice = async () => {
      try {
        setActionError(null);
        const invoice = await apiFetch<InvoiceDetailRecord>(`/invoices/${selectedInvoiceId}`);
        if (!active) {
          return;
        }
        setSelectedInvoiceDetail(invoice);
        setSelectedCustomerId(invoice.customerId);
      } catch (err) {
        if (active) {
          setActionError(err);
        }
      }
    };
    loadInvoice();
    return () => {
      active = false;
    };
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setInvoices([]);
      return;
    }
    let active = true;
    const loadInvoices = async () => {
      try {
        setActionError(null);
        const params = new URLSearchParams();
        params.set("customerId", selectedCustomerId);
        params.set("status", "POSTED");
        params.set("page", "1");
        params.set("pageSize", "200");
        const result = await apiFetch<PaginatedResponse<InvoiceListRecord>>(`/invoices?${params.toString()}`);
        if (!active) {
          return;
        }
        setInvoices((previous) => mergeInvoices(previous, result.data));
      } catch (err) {
        if (active) {
          setActionError(err);
        }
      }
    };
    loadInvoices();
    return () => {
      active = false;
    };
  }, [selectedCustomerId]);

  const createCreditNote = async () => {
    if (!selectedInvoiceDetail) {
      setActionError("Select a posted invoice first.");
      return;
    }
    setCreating(true);
    try {
      setActionError(null);
      const payload: CreditNoteCreateInput = {
        customerId: selectedInvoiceDetail.customerId,
        invoiceId: selectedInvoiceDetail.id,
        creditNoteDate: new Date(),
        currency: selectedInvoiceDetail.currency ?? orgCurrency,
        exchangeRate: Number(selectedInvoiceDetail.exchangeRate ?? 1),
        lines: selectedInvoiceDetail.lines.map((line) => {
          const description = (line.description ?? "").trim();
          const safeDescription = description.length >= 2 ? description : "Credit line";
          return {
            itemId: line.itemId ?? undefined,
            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
            incomeAccountId: line.incomeAccountId ?? undefined,
            description: safeDescription,
            qty: Number(line.qty ?? 0),
            unitPrice: Number(line.unitPrice ?? 0),
            discountAmount: Number(line.discountAmount ?? 0),
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
        title: "Credit note draft created",
        description: selectedInvoiceDetail.number
          ? `Draft created from invoice ${selectedInvoiceDetail.number}.`
          : "Draft created from invoice.",
      });
      router.push(`/credit-notes/${created.id}`);
    } catch (err) {
      setActionError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to create credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setCreating(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="card">
        <PageHeader
          title="Credit Notes"
          heading="New Credit Note"
          description="You do not have permission to create credit notes."
          icon={<FileText className="h-5 w-5" />}
        />
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>
          Back to Credit Notes
        </Button>
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Credit Notes"
        heading="New Credit Note"
        description="Select a posted invoice to generate a credit note draft."
        icon={<FileText className="h-5 w-5" />}
      />

      {loading ? <p className="muted">Loading references...</p> : null}
      {actionError ? <ErrorBanner error={actionError} /> : null}

      <div className="form-grid">
        <label>
          Customer *
          <Select
            value={selectedCustomerId}
            onValueChange={(value) => {
              setSelectedCustomerId(value);
              if (selectedInvoiceDetail?.customerId !== value) {
                setSelectedInvoiceId("");
                setSelectedInvoiceDetail(null);
              }
            }}
          >
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
        </label>

        <label>
          Posted Invoice *
          <Select
            value={selectedInvoiceId}
            onValueChange={(value) => setSelectedInvoiceId(value)}
            disabled={!selectedCustomerId}
          >
            <SelectTrigger aria-label="Posted invoice">
              <SelectValue placeholder={selectedCustomerId ? "Select invoice" : "Select customer first"} />
            </SelectTrigger>
            <SelectContent>
              {invoices.map((invoice) => (
                <SelectItem key={invoice.id} value={invoice.id}>
                  {invoice.number ?? "Invoice"} | {formatDate(invoice.invoiceDate)} | {formatMoney(invoice.total, invoice.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {selectedInvoice ? (
        <>
          <div style={{ height: 16 }} />
          <div className="form-grid">
            <div>
              <p className="muted">Invoice</p>
              <p>{selectedInvoice.number ?? "Posted invoice"}</p>
            </div>
            <div>
              <p className="muted">Invoice Date</p>
              <p>{formatDate(selectedInvoice.invoiceDate)}</p>
            </div>
            <div>
              <p className="muted">Total</p>
              <p>{formatMoney(selectedInvoice.total, selectedInvoice.currency)}</p>
            </div>
          </div>
        </>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="form-action-bar">
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>
          Cancel
        </Button>
        <Button type="button" onClick={createCreditNote} disabled={!selectedInvoiceId || creating}>
          {creating ? "Creating..." : "Create Credit Note Draft"}
        </Button>
      </div>
    </div>
  );
}
