"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft } from "lucide-react";
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

type PaymentListItem = {
  id: string;
  number?: string | null;
  status: string;
  paymentDate: string;
  amountTotal: string | number;
  currency: string;
  customer: { name: string };
};

type CustomerOption = { id: string; name: string; isActive: boolean };

export default function PaymentsReceivedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.PAYMENT_RECEIVED_WRITE);

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
        const data = await apiFetch<PaymentListItem[]>(`/payments-received${query ? `?${query}` : ""}`);
        setPayments(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load payments.");
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
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
    router.replace(query ? `/payments-received?${query}` : "/payments-received");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/payments-received");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/payments-received?${queryString}` : "/payments-received");
  };

  const rows = useMemo(() => payments, [payments]);
  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers],
  );

  return (
    <div className="card">
      <PageHeader
        title="Payments Received"
        description="Record and post customer payments."
        icon={<ArrowDownLeft className="h-5 w-5" />}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/payments-received/new">Receive Payment</Link>
            </Button>
          ) : null
        }
      />
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="payments-received"
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
      {loading ? <p className="loader">Loading payments...</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No payments yet. Record your first payment.</p> : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment Date</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <Link href={`/payments-received/${payment.id}`}>{payment.number ?? "Draft"}</Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={payment.status} />
                </TableCell>
                <TableCell>{payment.customer?.name ?? "-"}</TableCell>
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
