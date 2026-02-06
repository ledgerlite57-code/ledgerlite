"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "../../../src/lib/ui-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { formatDate } from "../../../src/lib/format";
import { PageHeader } from "../../../src/lib/ui-page-header";
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

type JournalListItem = {
  id: string;
  number?: string | null;
  status: string;
  journalDate: string;
  memo?: string | null;
};

const PAGE_SIZE = 20;
const resolveNumber = (journal: JournalListItem) => journal.number ?? "Draft";

export default function JournalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [journals, setJournals] = useState<JournalListItem[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFiltersState>(defaultFilters);
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.JOURNAL_WRITE);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = parseFiltersFromParams(params);
    const pageParam = Number(params.get("page") ?? "1");
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    setFilters(nextFilters);
    const loadJournals = async () => {
      setLoading(true);
      try {
        setActionError(null);
        const queryParams = new URLSearchParams(buildFilterQueryRecord(nextFilters));
        queryParams.set("page", String(page));
        queryParams.set("pageSize", String(PAGE_SIZE));
        const query = queryParams.toString();
        const result = await apiFetch<PaginatedResponse<JournalListItem>>(`/journals${query ? `?${query}` : ""}`);
        setJournals(result.data);
        setPageInfo(result.pageInfo);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load journals.");
      } finally {
        setLoading(false);
      }
    };
    loadJournals();
  }, [searchParams]);

  const applyFilters = (nextFilters = filters) => {
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const query = params.toString();
    router.replace(query ? `/journals?${query}` : "/journals");
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    router.replace("/journals");
  };

  const handlePageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    const activeFilters = parseFiltersFromParams(params);
    const queryParams = new URLSearchParams(buildFilterQueryRecord(activeFilters, { includeDateRange: true }));
    if (nextPage > 1) {
      queryParams.set("page", String(nextPage));
    }
    const query = queryParams.toString();
    router.replace(query ? `/journals?${query}` : "/journals");
  };

  const applySavedView = (query: Record<string, string>) => {
    const nextFilters = parseFiltersFromParams(new URLSearchParams(query));
    setFilters(nextFilters);
    const params = new URLSearchParams(buildFilterQueryRecord(nextFilters, { includeDateRange: true }));
    const queryString = params.toString();
    router.replace(queryString ? `/journals?${queryString}` : "/journals");
  };

  const rows = useMemo(() => journals, [journals]);
  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);

  return (
    <div className="card">
      <PageHeader
        title="Journals"
        description="Create manual journal entries and post to the ledger."
        icon={<BookOpen className="h-5 w-5" />}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/journals/new">New Journal</Link>
            </Button>
          ) : null
        }
      />
      <FilterRow
        leadingSlot={
          <SavedViewsMenu
            entityType="journals"
            currentQuery={buildFilterQueryRecord(filters, { includeDateRange: true })}
            onApplyView={applySavedView}
          />
        }
        search={filters.q}
        status={filters.status}
        dateRange={filters.dateRange}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
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
        onApply={() => applyFilters(filters)}
        onReset={resetFilters}
        isLoading={loading}
      />
      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p className="loader">Loading journals...</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">No journals yet. Create your first journal entry.</p> : null}
      {rows.length > 0 ? (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Journal Date</TableHead>
              <TableHead>Memo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((journal) => (
              <TableRow key={journal.id}>
                <TableCell>
                  <Link href={`/journals/${journal.id}`}>{resolveNumber(journal)}</Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={journal.status} />
                </TableCell>
                <TableCell>{formatDate(journal.journalDate)}</TableCell>
                <TableCell>{journal.memo ?? "-"}</TableCell>
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
