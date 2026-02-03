"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "../../../src/lib/ui-button";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
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

type PdcDirectionFilter = "all" | "INCOMING" | "OUTGOING";

type PdcListItem = {
  id: string;
  number?: string | null;
  chequeNumber: string;
  direction: "INCOMING" | "OUTGOING";
  status: string;
  chequeDate: string;
  expectedClearDate: string;
  amountTotal: string | number;
  currency: string;
  customer?: { name: string } | null;
  vendor?: { name: string } | null;
};

type CustomerOption = { id: string; name: string; isActive: boolean };
type VendorOption = { id: string; name: string; isActive: boolean };

const parseDirection = (value: string | null): PdcDirectionFilter =>
  value === "INCOMING" || value === "OUTGOING" ? value : "all";

const formatDirection = (value: PdcListItem["direction"]) => (value === "INCOMING" ? "Incoming" : "Outgoing");

export default function PdcPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pdcList, setPdcList] = useState<PdcListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [direction, setDirection] = useState<PdcDirectionFilter>("all");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.PDC_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextDirection = parseDirection(params.get("direction"));
    const nextFilters = parseFiltersFromParams(params);
    setDirection(nextDirection);
    setFilters(nextFilters);

    const loadPdc = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryRecord = buildFilterQueryRecord(nextFilters);
        if (nextDirection !== "all") {
          queryRecord.direction = nextDirection;
        }
        const query = new URLSearchParams(queryRecord).toString();
        const data = await apiFetch<PdcListItem[]>(`/pdc${query ? `?${query}` : ""}`);
        setPdcList(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load PDC records.");
      } finally {
        setLoading(false);
      }
    };

    loadPdc();
  }, [searchParams]);

  useEffect(() => {
    if (direction !== "INCOMING") {
      return;
    }
    const loadCustomers = async () => {
      try {
        const params = new URLSearchParams();
        const trimmed = customerSearch.trim();
        if (trimmed) {
          params.set("search", trimmed);
        }
        const result = await apiFetch<PaginatedResponse<CustomerOption> | CustomerOption[]>(
          `/customers${params.toString() ? `?${params.toString()}` : ""}`,
        );
        const data = Array.isArray(result) ? result : result.data ?? [];
        setCustomers(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load customers.");
      }
    };
    loadCustomers();
  }, [customerSearch, direction]);

  useEffect(() => {
    if (direction !== "OUTGOING") {
      return;
    }
    const loadVendors = async () => {
      try {
        const params = new URLSearchParams();
        const trimmed = vendorSearch.trim();
        if (trimmed) {
          params.set("search", trimmed);
        }
        const result = await apiFetch<PaginatedResponse<VendorOption> | VendorOption[]>(
          `/vendors${params.toString() ? `?${params.toString()}` : ""}`,
        );
        const data = Array.isArray(result) ? result : result.data ?? [];
        setVendors(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load vendors.");
      }
    };
    loadVendors();
  }, [vendorSearch, direction]);

  const applyFilters = (nextFilters = filters, nextDirection = direction) => {
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    if (nextDirection !== "all") {
      params.set("direction", nextDirection);
    }
    const query = params.toString();
    router.replace(query ? `/pdc?${query}` : "/pdc");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setDirection("all");
    router.replace("/pdc");
  };

  const applySavedView = (query: Record<string, string>) => {
    const params = new URLSearchParams(query);
    const nextDirection = parseDirection(params.get("direction"));
    const nextFilters = parseFiltersFromParams(params);
    setDirection(nextDirection);
    setFilters(nextFilters);
    applyFilters(nextFilters, nextDirection);
  };

  const rows = useMemo(() => pdcList, [pdcList]);
  const partyLabel = direction === "INCOMING" ? "Customer" : direction === "OUTGOING" ? "Vendor" : undefined;
  const partyValue = direction === "INCOMING" ? filters.customerId : direction === "OUTGOING" ? filters.vendorId : "";
  const partyOptions =
    direction === "INCOMING"
      ? customers.map((customer) => ({ value: customer.id, label: customer.name }))
      : direction === "OUTGOING"
        ? vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))
        : [];

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>PDC Management</h1>
          <p className="muted">Track post-dated cheques from draft to clearance.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/pdc/new">New PDC</Link>
          </Button>
        ) : null}
      </div>

      <div className="form-grid">
        <label>
          Direction
          <Select
            value={direction}
            onValueChange={(value) => {
              const nextDirection = parseDirection(value);
              setDirection(nextDirection);
              setFilters((prev) => ({
                ...prev,
                customerId: nextDirection === "INCOMING" ? prev.customerId : "",
                vendorId: nextDirection === "OUTGOING" ? prev.vendorId : "",
              }));
            }}
          >
            <SelectTrigger aria-label="Direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="INCOMING">Incoming</SelectItem>
              <SelectItem value="OUTGOING">Outgoing</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div style={{ height: 12 }} />
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="pdc"
            currentQuery={{
              ...buildFilterQueryRecord(filters, { includeDateRange: true }),
              ...(direction !== "all" ? { direction } : {}),
            }}
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
        partyLabel={partyLabel}
        partyValue={partyValue}
        partyOptions={partyOptions}
        partySearch={direction === "INCOMING" ? customerSearch : vendorSearch}
        onPartySearchChange={direction === "INCOMING" ? setCustomerSearch : setVendorSearch}
        onPartyChange={(value) => {
          if (direction === "INCOMING") {
            setFilters((prev) => ({ ...prev, customerId: value }));
            return;
          }
          if (direction === "OUTGOING") {
            setFilters((prev) => ({ ...prev, vendorId: value }));
          }
        }}
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
        onApply={() => applyFilters(filters, direction)}
        onReset={resetFilters}
        isLoading={loading}
      />

      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p className="loader">Loading PDC records...</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No PDC records found.</p> : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Cheque #</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Cheque Date</TableHead>
              <TableHead>Expected Clear</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((pdc) => (
              <TableRow key={pdc.id}>
                <TableCell>
                  <Link href={`/pdc/${pdc.id}`}>{pdc.number ?? pdc.chequeNumber}</Link>
                </TableCell>
                <TableCell>{pdc.chequeNumber}</TableCell>
                <TableCell>{formatDirection(pdc.direction)}</TableCell>
                <TableCell>
                  <StatusChip status={pdc.status} />
                </TableCell>
                <TableCell>{pdc.direction === "INCOMING" ? pdc.customer?.name ?? "-" : pdc.vendor?.name ?? "-"}</TableCell>
                <TableCell>{formatDate(pdc.chequeDate)}</TableCell>
                <TableCell>{formatDate(pdc.expectedClearDate)}</TableCell>
                <TableCell>{formatMoney(pdc.amountTotal, pdc.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
