"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../../src/lib/ui-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { formatDate, formatMoney } from "../../../src/lib/format";
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

type VendorPaymentListItem = {
  id: string;
  number?: string | null;
  status: string;
  paymentDate: string;
  amountTotal: string | number;
  currency: string;
  vendor: { name: string };
};

type VendorOption = { id: string; name: string; isActive: boolean };

const resolveNumber = (payment: VendorPaymentListItem) => payment.number ?? "Draft";

export default function VendorPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<VendorPaymentListItem[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.VENDOR_PAYMENT_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    setFilters(nextFilters);
    const loadPayments = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        const query = queryParams.toString();
        const data = await apiFetch<VendorPaymentListItem[]>(`/vendor-payments${query ? `?${query}` : ""}`);
        setPayments(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load vendor payments.");
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [searchParams]);

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const result = await apiFetch<VendorOption[] | PaginatedResponse<VendorOption>>("/vendors?pageSize=100");
        const data = Array.isArray(result) ? result : result.data ?? [];
        setVendors(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load vendors.");
      }
    };
    loadVendors();
  }, []);

  const applyFilters = (nextFilters = filters) => {
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const query = params.toString();
    router.replace(query ? `/vendor-payments?${query}` : "/vendor-payments");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/vendor-payments");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/vendor-payments?${queryString}` : "/vendor-payments");
  };

  const rows = useMemo(() => payments, [payments]);
  const vendorOptions = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
    [vendors],
  );

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Vendor Payments</h1>
          <p className="muted">Pay vendor bills and post to AP.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/vendor-payments/new">Pay Vendor</Link>
          </Button>
        ) : null}
      </div>
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="vendor-payments"
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
      {loading ? <p className="loader">Loading vendor payments...</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="muted">No vendor payments yet. Record your first vendor payment.</p>
      ) : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Payment Date</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <Link href={`/vendor-payments/${payment.id}`}>{resolveNumber(payment)}</Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={payment.status} />
                </TableCell>
                <TableCell>{payment.vendor?.name ?? "-"}</TableCell>
                <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                <TableCell>{formatMoney(payment.amountTotal, payment.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
