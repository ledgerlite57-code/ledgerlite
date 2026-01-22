"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "../../../src/lib/ui-button";
import { Input } from "../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { formatDate } from "../../../src/lib/format";
import { Permissions, type PaginatedResponse } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";

type JournalListItem = {
  id: string;
  number?: string | null;
  status: string;
  journalDate: string;
  memo?: string | null;
};

const resolveNumber = (journal: JournalListItem) => journal.number ?? "Draft";

export default function JournalsPage() {
  const [journals, setJournals] = useState<JournalListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.JOURNAL_WRITE);

  const buildQuery = (searchValue: string, statusValue: string) => {
    const params = new URLSearchParams();
    if (searchValue.trim()) {
      params.set("q", searchValue.trim());
      params.set("search", searchValue.trim());
    }
    if (statusValue !== "all") {
      params.set("status", statusValue);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const loadJournals = async (searchValue = search, statusValue = status) => {
    setLoading(true);
    try {
      setActionError(null);
      const result = await apiFetch<PaginatedResponse<JournalListItem>>(
        `/journals${buildQuery(searchValue, statusValue)}`,
      );
      setJournals(result.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load journals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJournals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => journals, [journals]);

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Journals</h1>
          <p className="muted">Create manual journal entries and post to the ledger.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/journals/new">New Journal</Link>
          </Button>
        ) : null}
      </div>
      <div className="filter-row">
        <label>
          Search
          <Input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Journal status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="POSTED">Posted</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div>
          <Button variant="secondary" onClick={() => loadJournals()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p>Loading journals...</p> : null}
      {!loading && rows.length === 0 ? <p>No journals yet. Create your first journal entry.</p> : null}
      {rows.length > 0 ? (
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
                  <span className={`status-badge ${journal.status.toLowerCase()}`}>{journal.status}</span>
                </TableCell>
                <TableCell>{formatDate(journal.journalDate)}</TableCell>
                <TableCell>{journal.memo ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
