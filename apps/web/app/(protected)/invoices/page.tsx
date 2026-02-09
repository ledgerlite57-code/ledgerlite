"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, FileText, Lock, Receipt } from "lucide-react";
import { Button } from "../../../src/lib/ui-button";
import { formatDate, formatMoney } from "../../../src/lib/format";
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

const PAGE_SIZE = 20;

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.INVOICE_WRITE);
  const canViewReports = hasPermission(Permissions.REPORTS_VIEW);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    const pageParam = Number(params.get("page") ?? "1");
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    setFilters(nextFilters);
    const loadInvoices = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(PAGE_SIZE));
        const query = queryParams.toString();
        const result = await apiFetch<PaginatedResponse<InvoiceListItem>>(`/invoices${query ? `?${query}` : ""}`);
        setInvoices(result.data);
        setPageInfo(result.pageInfo);
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
    router.replace(query ? `/invoices?${query}` : "/invoices");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/invoices");
  };

  const handlePageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    const activeFilters = parseFiltersFromParams(params);
    const queryParams = new URLSearchParams(buildFilterQueryRecord(activeFilters, { includeDateRange: true }));
    if (nextPage > 1) {
      queryParams.set("page", String(nextPage));
    }
    const query = queryParams.toString();
    router.replace(query ? `/invoices?${query}` : "/invoices");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/invoices?${queryString}` : "/invoices");
  };

  const rows = useMemo(() => invoices, [invoices]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);
  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers],
  );
  const hasActiveFilters = useMemo(
    () => Object.keys(buildFilterQueryRecord(filters, { includeDateRange: true })).length > 0,
    [filters],
  );
  const showEmptyOnboarding = !loading && rows.length === 0 && pageInfo.total === 0 && !hasActiveFilters;
  const showEmptyResults = !loading && rows.length === 0 && !showEmptyOnboarding;

  return (
    <div className="card">
      <PageHeader
        title="Invoices"
        description="Draft and post customer invoices."
        icon={<Receipt className="h-5 w-5" />}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <HelpDrawer
              title="Invoices Help"
              summary="Create invoices, post them, and track collections with clear due dates."
              buttonLabel="What this means"
            >
              <HelpSection label="When to post">
                <p>Post only after amounts, tax, and customer details are final.</p>
              </HelpSection>
              <HelpSection label="Statuses">
                <p>
                  <TermHint term="DRAFT" hint="Not posted to the ledger yet." /> lets you edit safely.
                  <TermHint term="POSTED" hint="Locked accounting entry ready for collection." /> means accounting impact is
                  recorded.
                </p>
              </HelpSection>
              <HelpSection label="Collections">
                <p>Set realistic due dates so AR aging reflects payment risk correctly.</p>
              </HelpSection>
            </HelpDrawer>
            {canCreate ? (
              <Button asChild>
                <Link href="/invoices/new">New Invoice</Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <FilterRow
        quickFields={["search", "status", "dateRange", "party"]}
        advancedTitle="Invoice Advanced Filters"
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
      {loading ? <p className="loader">Loading invoices...</p> : null}
      {showEmptyOnboarding ? (
        <div className="invoice-empty">
          <section className="invoice-empty-hero">
            <div className="invoice-empty-copy">
              <p className="invoice-empty-eyebrow">Invoice Center</p>
              <h2>It&apos;s time to get paid.</h2>
              <p className="invoice-empty-lede muted">
                Build polished invoices, post them to your ledger, and track collections with clear due dates.
              </p>
              <div className="invoice-empty-actions">
                {canCreate ? (
                  <Button asChild>
                    <Link href="/invoices/new">New Invoice</Link>
                  </Button>
                ) : null}
                {canViewReports ? (
                  <Button asChild variant="secondary">
                    <Link href="/reports/ar-aging">View AR Aging</Link>
                  </Button>
                ) : null}
              </div>
              <div className="chip-row">
                <span className="invoice-empty-chip">Draft -&gt; Posted -&gt; Paid</span>
                <span className="invoice-empty-chip">Auto totals + tax</span>
                <span className="invoice-empty-chip">Due dates + aging</span>
              </div>
            </div>
            <div className="invoice-empty-preview" aria-hidden="true">
              <div className="invoice-preview-header">
                <div>
                  <p className="invoice-preview-label">Invoice preview</p>
                  <p className="invoice-preview-title">Nova Design Studio</p>
                  <p className="invoice-preview-subtitle">Due in 14 days</p>
                </div>
                <span className="invoice-preview-pill">Draft</span>
              </div>
              <div className="invoice-preview-lines">
                <div className="invoice-preview-line">
                  <span>Brand identity sprint</span>
                  <span>$1,200.00</span>
                </div>
                <div className="invoice-preview-line">
                  <span>Website UI kit</span>
                  <span>$500.00</span>
                </div>
                <div className="invoice-preview-line muted">
                  <span>Tax (5%)</span>
                  <span>$150.00</span>
                </div>
              </div>
              <div className="invoice-preview-total">
                <span>Total</span>
                <span>$1,850.00</span>
              </div>
              <div className="invoice-preview-footer">
                <Receipt className="h-4 w-4" />
                <span>Draft, post, collect, and reconcile.</span>
              </div>
            </div>
          </section>
          <section className="invoice-empty-lifecycle">
            <div>
              <h3>Life cycle of an invoice</h3>
              <p className="muted">Move from draft to paid with every step recorded.</p>
            </div>
            <div className="invoice-lifecycle-grid">
              <article className="invoice-lifecycle-card">
                <div className="invoice-lifecycle-icon">
                  <FileText className="h-5 w-5" />
                </div>
                <h4>Draft and review</h4>
                <p className="muted">Capture line items, taxes, and terms before you post.</p>
              </article>
              <article className="invoice-lifecycle-card">
                <div className="invoice-lifecycle-icon">
                  <Lock className="h-5 w-5" />
                </div>
                <h4>Post to the ledger</h4>
                <p className="muted">Lock the invoice and create clean AR entries automatically.</p>
              </article>
              <article className="invoice-lifecycle-card">
                <div className="invoice-lifecycle-icon">
                  <CreditCard className="h-5 w-5" />
                </div>
                <h4>Collect payments</h4>
                <p className="muted">Record receipts and watch balances drop in real time.</p>
              </article>
            </div>
          </section>
        </div>
      ) : null}
      {showEmptyResults ? (
        <EmptyState
          title="No invoices match these filters"
          description="Try adjusting or resetting your filters to see more results."
          actions={
            <Button variant="secondary" onClick={resetFilters}>
              Reset Filters
            </Button>
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
                <TableHead>Customer</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/invoices/${invoice.id}`)}
                >
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
                  <TableCell>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/invoices/${invoice.id}`} onClick={(event) => event.stopPropagation()}>
                          View
                        </Link>
                      </Button>
                      {canCreate && invoice.status === "POSTED" ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/credit-notes/new?invoiceId=${encodeURIComponent(invoice.id)}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Credit Note
                          </Link>
                        </Button>
                      ) : null}
                    </div>
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
