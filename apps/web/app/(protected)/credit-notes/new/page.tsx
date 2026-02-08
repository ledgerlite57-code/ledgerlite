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
import { Input } from "../../../../src/lib/ui-input";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
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
    id?: string;
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

type UnitOfMeasureRecord = {
  id: string;
  name: string;
  symbol: string;
  baseUnitId?: string | null;
  conversionRate?: string | number | null;
  isActive: boolean;
};

type ReturnSelection = {
  include: boolean;
  qty: string;
  unitOfMeasureId?: string;
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
  const [returnSelections, setReturnSelections] = useState<Record<number, ReturnSelection>>({});
  const [returnInventory, setReturnInventory] = useState(true);
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<UnitOfMeasureRecord[]>([]);
  const [lineSelectionError, setLineSelectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [orgCurrency, setOrgCurrency] = useState("AED");

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );
  const unitsById = useMemo(() => new Map(unitsOfMeasure.map((unit) => [unit.id, unit])), [unitsOfMeasure]);
  const activeUnits = useMemo(() => unitsOfMeasure.filter((unit) => unit.isActive), [unitsOfMeasure]);
  const getUnitRate = useCallback(
    (unitId?: string | null) => {
      if (!unitId) {
        return 1;
      }
      const unit = unitsById.get(unitId);
      const rate = unit?.conversionRate != null ? Number(unit.conversionRate) : 1;
      return Number.isFinite(rate) && rate > 0 ? rate : 1;
    },
    [unitsById],
  );
  const getUnitBaseId = useCallback(
    (unitId?: string | null) => {
      if (!unitId) {
        return "";
      }
      const unit = unitsById.get(unitId);
      return unit ? (unit.baseUnitId ?? unit.id) : unitId;
    },
    [unitsById],
  );
  const convertUnitPrice = useCallback(
    (price: number, fromUnitId?: string | null, toUnitId?: string | null) => {
      const fromRate = getUnitRate(fromUnitId);
      const toRate = getUnitRate(toUnitId);
      if (!fromRate || !toRate) {
        return price;
      }
      const converted = price * (toRate / fromRate);
      return Number.isFinite(converted) ? Number(converted.toFixed(2)) : price;
    },
    [getUnitRate],
  );

  const loadReferences = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, customerResult, unitResult] = await Promise.all([
        apiFetch<{ baseCurrency?: string }>("/orgs/current"),
        apiFetch<PaginatedResponse<CustomerRecord>>("/customers"),
        apiFetch<UnitOfMeasureRecord[] | PaginatedResponse<UnitOfMeasureRecord>>(
          "/units-of-measurement?isActive=true",
        ).catch(() => []),
      ]);
      setOrgCurrency(org.baseCurrency ?? "AED");
      setCustomers(customerResult.data);
      setUnitsOfMeasure(Array.isArray(unitResult) ? unitResult : unitResult.data ?? []);
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
      setReturnSelections({});
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
        setReturnSelections(
          invoice.lines.reduce<Record<number, ReturnSelection>>((acc, line, index) => {
            const qty = Number(line.qty ?? 0);
            const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
            acc[index] = {
              include: safeQty > 0,
              qty: safeQty > 0 ? safeQty.toString() : "0",
              unitOfMeasureId: line.unitOfMeasureId ?? undefined,
            };
            return acc;
          }, {}),
        );
        setLineSelectionError(null);
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

  const hasSelectedReturnLine = useMemo(() => {
    if (!selectedInvoiceDetail) {
      return false;
    }
    return selectedInvoiceDetail.lines.some((line, index) => {
      const selection = returnSelections[index];
      if (!selection?.include) {
        return false;
      }
      const qty = Number(selection.qty ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        return false;
      }
      const selectedUnitId = selection.unitOfMeasureId ?? line.unitOfMeasureId ?? undefined;
      const lineBaseId = getUnitBaseId(line.unitOfMeasureId ?? undefined);
      const selectedBaseId = getUnitBaseId(selectedUnitId);
      if (lineBaseId && selectedBaseId && lineBaseId !== selectedBaseId) {
        return false;
      }
      const invoicedQty = Number(line.qty ?? 0);
      if (!Number.isFinite(invoicedQty) || invoicedQty <= 0) {
        return false;
      }
      const requestedBaseQty = qty * getUnitRate(selectedUnitId);
      const invoicedBaseQty = invoicedQty * getUnitRate(line.unitOfMeasureId ?? undefined);
      return requestedBaseQty <= invoicedBaseQty;
    });
  }, [getUnitBaseId, getUnitRate, returnSelections, selectedInvoiceDetail]);

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
        params.set("pageSize", "100");
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
    const selectedLines: CreditNoteCreateInput["lines"] = [];
    for (const [index, line] of selectedInvoiceDetail.lines.entries()) {
      const selection = returnSelections[index];
      if (!selection?.include) {
        continue;
      }
      const selectedQty = Number(selection.qty ?? 0);
      const invoicedQty = Number(line.qty ?? 0);
      const selectedUnitId = selection.unitOfMeasureId ?? line.unitOfMeasureId ?? undefined;
      const lineBaseId = getUnitBaseId(line.unitOfMeasureId ?? undefined);
      const selectedBaseId = getUnitBaseId(selectedUnitId);
      if (!Number.isFinite(selectedQty) || selectedQty <= 0) {
        setLineSelectionError(`Return quantity must be greater than zero on line ${index + 1}.`);
        return;
      }
      if (!Number.isFinite(invoicedQty) || invoicedQty <= 0) {
        setLineSelectionError(`Invoice line ${index + 1} has invalid quantity.`);
        return;
      }
      if (lineBaseId && selectedBaseId && lineBaseId !== selectedBaseId) {
        setLineSelectionError(`Selected unit is not compatible on line ${index + 1}.`);
        return;
      }
      const requestedBaseQty = selectedQty * getUnitRate(selectedUnitId);
      const invoicedBaseQty = invoicedQty * getUnitRate(line.unitOfMeasureId ?? undefined);
      if (requestedBaseQty > invoicedBaseQty) {
        setLineSelectionError(`Return quantity cannot exceed invoiced quantity on line ${index + 1}.`);
        return;
      }
      const description = (line.description ?? "").trim();
      const safeDescription = description.length >= 2 ? description : "Credit line";
      const originalDiscount = Number(line.discountAmount ?? 0);
      const originalUnitPrice = Number(line.unitPrice ?? 0);
      const adjustedUnitPrice = convertUnitPrice(originalUnitPrice, line.unitOfMeasureId ?? undefined, selectedUnitId);
      const proratedDiscount =
        invoicedBaseQty > 0 && Number.isFinite(originalDiscount)
          ? Number(((originalDiscount * requestedBaseQty) / invoicedBaseQty).toFixed(2))
          : 0;
      selectedLines.push({
        itemId: line.itemId ?? undefined,
        sourceInvoiceLineId: line.id ?? undefined,
        unitOfMeasureId: selectedUnitId,
        incomeAccountId: line.incomeAccountId ?? undefined,
        description: safeDescription,
        qty: selectedQty,
        unitPrice: adjustedUnitPrice,
        discountAmount: proratedDiscount,
        taxCodeId: line.taxCodeId ?? undefined,
      });
    }
    if (selectedLines.length === 0) {
      setLineSelectionError("Select at least one invoice line with a valid return quantity.");
      return;
    }

    setCreating(true);
    try {
      setActionError(null);
      setLineSelectionError(null);
      const payload: CreditNoteCreateInput = {
        customerId: selectedInvoiceDetail.customerId,
        invoiceId: selectedInvoiceDetail.id,
        returnInventory,
        creditNoteDate: new Date(),
        currency: selectedInvoiceDetail.currency ?? orgCurrency,
        exchangeRate: Number(selectedInvoiceDetail.exchangeRate ?? 1),
        lines: selectedLines,
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
        <label>
          Credit behavior
          <Select
            value={returnInventory ? "RETURN" : "FINANCIAL_ONLY"}
            onValueChange={(value) => setReturnInventory(value === "RETURN")}
          >
            <SelectTrigger aria-label="Credit behavior">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RETURN">Return items to inventory</SelectItem>
              <SelectItem value="FINANCIAL_ONLY">Financial credit only (no restock)</SelectItem>
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
          {selectedInvoiceDetail ? (
            <>
              <div style={{ height: 16 }} />
              <div className="section-header">
                <div>
                  <h2>Returned items</h2>
                  <p className="muted">Choose the exact lines and quantities to credit.</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReturnSelections(
                        selectedInvoiceDetail.lines.reduce<Record<number, ReturnSelection>>((acc, line, index) => {
                          const qty = Number(line.qty ?? 0);
                          const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
                          acc[index] = {
                            include: safeQty > 0,
                            qty: safeQty > 0 ? safeQty.toString() : "0",
                            unitOfMeasureId: line.unitOfMeasureId ?? undefined,
                          };
                          return acc;
                        }, {}),
                      );
                      setLineSelectionError(null);
                    }}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReturnSelections(
                        selectedInvoiceDetail.lines.reduce<Record<number, ReturnSelection>>((acc, _line, index) => {
                          acc[index] = { include: false, qty: "0", unitOfMeasureId: undefined };
                          return acc;
                        }, {}),
                      );
                      setLineSelectionError(null);
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              </div>
              {lineSelectionError ? <p className="form-error">{lineSelectionError}</p> : null}
              <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>Return</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Invoiced Qty</TableHead>
                      <TableHead>Return Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Unit Price</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedInvoiceDetail.lines.map((line, index) => {
                    const selection = returnSelections[index] ?? {
                      include: false,
                      qty: "0",
                      unitOfMeasureId: line.unitOfMeasureId ?? undefined,
                    };
                    const invoicedQty = Number(line.qty ?? 0);
                    const safeInvoicedQty = Number.isFinite(invoicedQty) ? invoicedQty : 0;
                    const lineUnit = line.unitOfMeasureId ? unitsById.get(line.unitOfMeasureId) : undefined;
                    const lineBaseId = getUnitBaseId(line.unitOfMeasureId ?? undefined);
                    const compatibleUnits = lineBaseId
                      ? activeUnits.filter((unit) => (unit.baseUnitId ?? unit.id) === lineBaseId)
                      : [];
                    const selectedUnitId = selection.unitOfMeasureId ?? line.unitOfMeasureId ?? "";
                    const selectedUnitRate = getUnitRate(selectedUnitId || undefined);
                    const invoicedBaseQty = safeInvoicedQty * getUnitRate(line.unitOfMeasureId ?? undefined);
                    const maxReturnQty = selectedUnitRate > 0 ? invoicedBaseQty / selectedUnitRate : safeInvoicedQty;
                    const lineUnitPrice = convertUnitPrice(
                      Number(line.unitPrice ?? 0),
                      line.unitOfMeasureId ?? undefined,
                      selectedUnitId || undefined,
                    );
                    return (
                      <TableRow key={line.id ?? `${index}-${line.description}`}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selection.include}
                            onChange={(event) => {
                              const include = event.target.checked;
                              setReturnSelections((prev) => ({
                                ...prev,
                                [index]: {
                                  include,
                                  qty: include
                                    ? prev[index]?.qty && Number(prev[index]?.qty) > 0
                                      ? prev[index].qty
                                      : safeInvoicedQty.toString()
                                    : "0",
                                  unitOfMeasureId:
                                    prev[index]?.unitOfMeasureId ?? line.unitOfMeasureId ?? undefined,
                                },
                              }));
                              setLineSelectionError(null);
                            }}
                          />
                        </TableCell>
                        <TableCell>{line.description}</TableCell>
                        <TableCell>
                          {safeInvoicedQty}
                          {lineUnit ? ` ${lineUnit.symbol}` : ""}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={maxReturnQty}
                            value={selection.qty}
                            disabled={!selection.include}
                            onChange={(event) => {
                              setReturnSelections((prev) => ({
                                ...prev,
                                [index]: {
                                  include: prev[index]?.include ?? false,
                                  qty: event.target.value,
                                  unitOfMeasureId:
                                    prev[index]?.unitOfMeasureId ?? line.unitOfMeasureId ?? undefined,
                                },
                              }));
                              setLineSelectionError(null);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {compatibleUnits.length > 0 ? (
                            <Select
                              value={selectedUnitId}
                              onValueChange={(value) => {
                                setReturnSelections((prev) => ({
                                  ...prev,
                                  [index]: {
                                    include: prev[index]?.include ?? false,
                                    qty: prev[index]?.qty ?? "0",
                                    unitOfMeasureId: value,
                                  },
                                }));
                                setLineSelectionError(null);
                              }}
                              disabled={!selection.include}
                            >
                              <SelectTrigger aria-label={`Unit for line ${index + 1}`}>
                                <SelectValue placeholder="Select unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {compatibleUnits.map((unit) => (
                                  <SelectItem key={unit.id} value={unit.id}>
                                    {unit.name} ({unit.symbol})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatMoney(lineUnitPrice, selectedInvoice.currency)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          ) : null}
        </>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="form-action-bar">
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>
          Cancel
        </Button>
        <Button type="button" onClick={createCreditNote} disabled={!selectedInvoiceId || creating || !hasSelectedReturnLine}>
          {creating ? "Creating..." : "Create Credit Note Draft"}
        </Button>
      </div>
    </div>
  );
}
