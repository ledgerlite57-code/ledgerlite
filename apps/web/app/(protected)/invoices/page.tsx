"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../../src/lib/ui-button";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { Permissions, type PaginatedResponse } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../src/lib/ui-status-chip";
import { FilterRow } from "../../../src/features/filters/filter-row";
import {
  buildFilterQueryRecord,
  defaultFilters,
  parseFiltersFromParams,
  resolveDateRangePreset,
  type ListFiltersState,
} from "../../../src/features/filters/filter-helpers";
import { SavedViewsMenu } from "../../../src/features/saved-views/saved-views-menu";

type InvoiceListItem = {
  id: string;
  number?: string | null;
  status: string;
  invoiceDate: string;
  dueDate: string;
  total: string | number;
  currency: string;
  customer: { name: string };
};

type CustomerOption = { id: string; name: string; isActive: boolean };

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.INVOICE_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    setFilters(nextFilters);
    const loadInvoices = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        const query = queryParams.toString();
        const result = await apiFetch<PaginatedResponse<InvoiceListItem>>(`/invoices${query ? `?${query}` : ""}`);
        setInvoices(result.data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load invoices.");
      } finally {
        setLoading(false);
      }
    };
    loadInvoices();
  }, [searchParams]);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const result = await apiFetch<PaginatedResponse<CustomerOption>>("/customers?pageSize=100");
        setCustomers(result.data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load customers.");
      }
    };
    loadCustomers();
  }, []);

  const applyFilters = (nextFilters = filters) => {
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const query = params.toString();
    router.replace(query ? `/invoices?${query}` : "/invoices");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/invoices");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/invoices?${queryString}` : "/invoices");
  };

  const rows = useMemo(() => invoices, [invoices]);
  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers],
  );

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="muted">Draft and post customer invoices.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/invoices/new">New Invoice</Link>
          </Button>
        ) : null}
      </div>
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="invoices"
            currentQuery={buildFilterQueryRecord(filters, { includeDateRange: true })}
            onApplyView={applySavedView}
          />
        }
        search={filters.q}
        status={filters.status}
        dateRange={filters.dateRange}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        amountMin={filters.amountMin}
        amountMax={filters.amountMax}
        partyLabel="Customer"
        partyValue={filters.customerId}
        partyOptions={customerOptions}
        onPartyChange={(value) => setFilters((prev) => ({ ...prev, customerId: value }))}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, q: value }))}
        onStatusChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
        onDateRangeChange={(value) => {
          const preset = resolveDateRangePreset(value);
          setFilters((prev) => ({
            ...prev,
            dateRange: value,
            dateFrom: value === "custom" ? prev.dateFrom : preset.dateFrom,
            dateTo: value === "custom" ? prev.dateTo : preset.dateTo,
          }));
        }}
        onDateFromChange={(value) => setFilters((prev) => ({ ...prev, dateRange: "custom", dateFrom: value }))}
        onDateToChange={(value) => setFilters((prev) => ({ ...prev, dateRange: "custom", dateTo: value }))}
        onAmountMinChange={(value) => setFilters((prev) => ({ ...prev, amountMin: value }))}
        onAmountMaxChange={(value) => setFilters((prev) => ({ ...prev, amountMax: value }))}
        onApply={() => applyFilters(filters)}
        onReset={resetFilters}
        isLoading={loading}
      />
      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p className="loader">Loading invoices...</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No invoices yet. Create your first invoice.</p> : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Invoice Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link href={`/invoices/${invoice.id}`}>{invoice.number ?? "Draft"}</Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={invoice.status} />
                </TableCell>
                <TableCell>{invoice.customer?.name ?? "-"}</TableCell>
                <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                <TableCell>{formatMoney(invoice.total, invoice.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
