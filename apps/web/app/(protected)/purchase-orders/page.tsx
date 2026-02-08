"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "../../../src/lib/ui-button";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { PageHeader } from "../../../src/lib/ui-page-header";
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

type PurchaseOrderListItem = {
  id: string;
  systemNumber?: string | null;
  poNumber?: string | null;
  status: string;
  poDate: string;
  expectedDeliveryDate?: string | null;
  total: string | number;
  billedAmount: string | number;
  remainingAmount: string | number;
  currency: string;
  vendor: { name: string };
};

type VendorOption = { id: string; name: string; isActive: boolean };

const PAGE_SIZE = 20;
const resolveNumber = (po: PurchaseOrderListItem) => po.systemNumber ?? po.poNumber ?? "Draft";

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderListItem[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.PURCHASE_ORDER_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    const pageParam = Number(params.get("page") ?? "1");
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    setFilters(nextFilters);
    const loadPurchaseOrders = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(PAGE_SIZE));
        const query = queryParams.toString();
        const result = await apiFetch<PaginatedResponse<PurchaseOrderListItem>>(
          `/purchase-orders${query ? `?${query}` : ""}`,
        );
        setPurchaseOrders(result.data);
        setPageInfo(result.pageInfo);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load purchase orders.");
      } finally {
        setLoading(false);
      }
    };
    loadPurchaseOrders();
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
    router.replace(query ? `/purchase-orders?${query}` : "/purchase-orders");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/purchase-orders");
  };

  const handlePageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    const activeFilters = parseFiltersFromParams(params);
    const queryParams = new URLSearchParams(buildFilterQueryRecord(activeFilters, { includeDateRange: true }));
    if (nextPage > 1) {
      queryParams.set("page", String(nextPage));
    }
    const query = queryParams.toString();
    router.replace(query ? `/purchase-orders?${query}` : "/purchase-orders");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/purchase-orders?${queryString}` : "/purchase-orders");
  };

  const rows = useMemo(() => purchaseOrders, [purchaseOrders]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);
  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  return (
    <div className="card">
      <PageHeader
        title="Purchase Orders"
        description="Create, receive, and convert purchase orders to bills."
        icon={<FileText className="h-5 w-5" />}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/purchase-orders/new">New Purchase Order</Link>
            </Button>
          ) : null
        }
      />
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="purchase-orders"
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
      {loading ? <p className="loader">Loading purchase orders...</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No purchase orders yet.</p> : null}
      {rows.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>PO Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => (
                <TableRow
                  key={po.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/purchase-orders/${po.id}`)}
                >
                  <TableCell>
                    <Link href={`/purchase-orders/${po.id}`}>{resolveNumber(po)}</Link>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={po.status} />
                  </TableCell>
                  <TableCell>{po.vendor?.name ?? "-"}</TableCell>
                  <TableCell>{formatDate(po.poDate)}</TableCell>
                  <TableCell>{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : "-"}</TableCell>
                  <TableCell>{formatMoney(po.total, po.currency)}</TableCell>
                  <TableCell>{formatMoney(po.remainingAmount, po.currency)}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/purchase-orders/${po.id}`} onClick={(event) => event.stopPropagation()}>
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
