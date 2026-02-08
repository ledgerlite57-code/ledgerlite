"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { Permissions, type PaginatedResponse } from "@ledgerlite/shared";
import { apiFetch } from "../../../src/lib/api";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { Button } from "../../../src/lib/ui-button";
import { PageHeader } from "../../../src/lib/ui-page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
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

type CreditNoteListItem = {
  id: string;
  number?: string | null;
  status: string;
  creditNoteDate: string;
  total: string | number;
  currency: string;
  customer: { name: string };
};

type CustomerOption = { id: string; name: string; isActive: boolean };

const PAGE_SIZE = 20;

export default function CreditNotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creditNotes, setCreditNotes] = useState<CreditNoteListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.INVOICE_READ);
  const canCreate = hasPermission(Permissions.INVOICE_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    const pageParam = Number(params.get("page") ?? "1");
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    setFilters(nextFilters);
    const loadCreditNotes = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(PAGE_SIZE));
        const query = queryParams.toString();
        const result = await apiFetch<PaginatedResponse<CreditNoteListItem>>(
          `/credit-notes${query ? `?${query}` : ""}`,
        );
        setCreditNotes(result.data);
        setPageInfo(result.pageInfo);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load credit notes.");
      } finally {
        setLoading(false);
      }
    };
    loadCreditNotes();
  }, [searchParams]);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("pageSize", "50");
        const trimmed = customerSearch.trim();
        if (trimmed) {
          params.set("search", trimmed);
        }
        const result = await apiFetch<PaginatedResponse<CustomerOption>>(`/customers?${params.toString()}`);
        setCustomers(result.data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load customers.");
      }
    };
    loadCustomers();
  }, [customerSearch]);

  const applyFilters = (nextFilters = filters) => {
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const query = params.toString();
    router.replace(query ? `/credit-notes?${query}` : "/credit-notes");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/credit-notes");
  };

  const handlePageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    const activeFilters = parseFiltersFromParams(params);
    const queryParams = new URLSearchParams(buildFilterQueryRecord(activeFilters, { includeDateRange: true }));
    if (nextPage > 1) {
      queryParams.set("page", String(nextPage));
    }
    const query = queryParams.toString();
    router.replace(query ? `/credit-notes?${query}` : "/credit-notes");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/credit-notes?${queryString}` : "/credit-notes");
  };

  const rows = useMemo(() => creditNotes, [creditNotes]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);
  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers],
  );

  if (!canView) {
    return (
      <div className="card">
        <PageHeader title="Credit Notes" heading="Credit Notes" description="Adjust posted invoices." icon={<FileText className="h-5 w-5" />} />
        <p className="muted">You do not have permission to view credit notes.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Credit Notes"
        description="Create and track customer credits."
        icon={<FileText className="h-5 w-5" />}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/credit-notes/new">New Credit Note</Link>
            </Button>
          ) : null
        }
      />
      <FilterRow
        quickFields={["search", "status", "dateRange", "party"]}
        advancedTitle="Credit Note Advanced Filters"
        leadingSlot={
          <SavedViewsMenu
            entityType="credit-notes"
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
        partySearch={customerSearch}
        onPartySearchChange={setCustomerSearch}
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
      {loading ? <p className="loader">Loading credit notes...</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No credit notes yet.</p> : null}
      {rows.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((creditNote) => (
                <TableRow
                  key={creditNote.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/credit-notes/${creditNote.id}`)}
                >
                  <TableCell>
                    <Link href={`/credit-notes/${creditNote.id}`}>{creditNote.number ?? "Draft"}</Link>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={creditNote.status} />
                  </TableCell>
                  <TableCell>{creditNote.customer?.name ?? "-"}</TableCell>
                  <TableCell>{formatDate(creditNote.creditNoteDate)}</TableCell>
                  <TableCell>{formatMoney(creditNote.total, creditNote.currency)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/credit-notes/${creditNote.id}`} onClick={(event) => event.stopPropagation()}>
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <div className="muted">Showing {rows.length} of {pageInfo.total}</div>
              <div className="muted">
                Page {pageInfo.page} of {pageCount}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => handlePageChange(Math.max(1, pageInfo.page - 1))}
                disabled={pageInfo.page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePageChange(Math.min(pageCount, pageInfo.page + 1))}
                disabled={pageInfo.page >= pageCount || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
