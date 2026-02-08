"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "../../../src/lib/ui-button";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { toCents } from "../../../src/lib/money";
import { PageHeader } from "../../../src/lib/ui-page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { Permissions, type PaginatedResponse } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";
import { StatusChip } from "../../../src/lib/ui-status-chip";
import { EmptyState } from "../../../src/lib/ui-empty-state";
import { HelpDrawer, HelpSection, TermHint } from "../../../src/lib/ui-help-drawer";
import { FilterRow } from "../../../src/features/filters/filter-row";
import {
  buildFilterQueryRecord,
  defaultFilters,
  parseFiltersFromParams,
  resolveDateRangePreset,
  type ListFiltersState,
} from "../../../src/features/filters/filter-helpers";
import { SavedViewsMenu } from "../../../src/features/saved-views/saved-views-menu";

type BillListItem = {
  id: string;
  systemNumber?: string | null;
  billNumber?: string | null;
  status: string;
  billDate: string;
  dueDate: string;
  total: string | number;
  amountPaid?: string | number;
  currency: string;
  vendor: { name: string };
};

type VendorOption = { id: string; name: string; isActive: boolean };

const PAGE_SIZE = 20;
const resolveNumber = (bill: BillListItem) => bill.systemNumber ?? bill.billNumber ?? "Draft";
const resolveDisplayStatus = (bill: BillListItem) => {
  if (bill.status !== "POSTED") {
    return bill.status;
  }
  const totalCents = toCents(bill.total ?? 0);
  const paidCents = toCents(bill.amountPaid ?? 0);
  if (paidCents >= totalCents) {
    return bill.status;
  }
  const due = new Date(bill.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) {
    return "OVERDUE";
  }
  return "OPEN";
};

export default function BillsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bills, setBills] = useState<BillListItem[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.BILL_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    const pageParam = Number(params.get("page") ?? "1");
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    setFilters(nextFilters);
    const loadBills = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(PAGE_SIZE));
        const query = queryParams.toString();
        const result = await apiFetch<PaginatedResponse<BillListItem>>(`/bills${query ? `?${query}` : ""}`);
        setBills(result.data);
        setPageInfo(result.pageInfo);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load bills.");
      } finally {
        setLoading(false);
      }
    };
    loadBills();
  }, [searchParams]);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const params = new URLSearchParams();
        const trimmed = vendorSearch.trim();
        if (trimmed) {
          params.set("search", trimmed);
        }
        const query = params.toString();
        const result = await apiFetch<VendorOption[] | PaginatedResponse<VendorOption>>(
          `/vendors${query ? `?${query}` : ""}`,
        );
        const data = Array.isArray(result) ? result : result.data ?? [];
        setVendors(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load vendors.");
      }
    };
    loadVendors();
  }, [vendorSearch]);

  const applyFilters = (nextFilters = filters) => {
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const query = params.toString();
    router.replace(query ? `/bills?${query}` : "/bills");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/bills");
  };

  const handlePageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    const activeFilters = parseFiltersFromParams(params);
    const queryParams = new URLSearchParams(buildFilterQueryRecord(activeFilters, { includeDateRange: true }));
    if (nextPage > 1) {
      queryParams.set("page", String(nextPage));
    }
    const query = queryParams.toString();
    router.replace(query ? `/bills?${query}` : "/bills");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/bills?${queryString}` : "/bills");
  };

  const rows = useMemo(() => bills, [bills]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);
  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  return (
    <div className="card">
      <PageHeader
        title="Bills"
        description="Track vendor bills and post them to AP."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <HelpDrawer
              title="Bills Help"
              summary="Record vendor obligations, post to AP, and monitor due payments."
              buttonLabel="What this means"
            >
              <HelpSection label="When to use">
                <p>Create a bill when you receive a vendor invoice or expense document payable later.</p>
              </HelpSection>
              <HelpSection label="Statuses">
                <p>
                  <TermHint term="DRAFT" hint="Editable and not posted." /> is safe for preparation.
                  <TermHint term="POSTED" hint="AP and expense impact recorded in ledger." /> moves it into payables.
                </p>
              </HelpSection>
              <HelpSection label="Payment control">
                <p>Set due dates carefully to keep AP aging and cash planning accurate.</p>
              </HelpSection>
            </HelpDrawer>
            {canCreate ? (
              <Button asChild>
                <Link href="/bills/new">New Bill</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="bills"
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
        partyLabel="Vendor"
        partyValue={filters.vendorId}
        partyOptions={vendorOptions}
        partySearch={vendorSearch}
        onPartySearchChange={setVendorSearch}
        onPartyChange={(value) => setFilters((prev) => ({ ...prev, vendorId: value }))}
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
      {loading ? <p className="loader">Loading bills...</p> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No bills yet"
          description="Record your first vendor bill to start tracking payables and upcoming due amounts."
          actions={
            canCreate ? (
              <Button asChild>
                <Link href="/bills/new">Create First Bill</Link>
              </Button>
            ) : null
          }
        />
      ) : null}
      {rows.length > 0 ? (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Bill Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((bill) => (
              <TableRow
                key={bill.id}
                className="cursor-pointer"
                onClick={() => router.push(`/bills/${bill.id}`)}
              >
                <TableCell>
                  <Link href={`/bills/${bill.id}`}>{resolveNumber(bill)}</Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={resolveDisplayStatus(bill)} />
                </TableCell>
                <TableCell>{bill.vendor?.name ?? "-"}</TableCell>
                <TableCell>{formatDate(bill.billDate)}</TableCell>
                <TableCell>{formatDate(bill.dueDate)}</TableCell>
                <TableCell>{formatMoney(bill.total, bill.currency)}</TableCell>
                <TableCell>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/bills/${bill.id}`} onClick={(event) => event.stopPropagation()}>
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
