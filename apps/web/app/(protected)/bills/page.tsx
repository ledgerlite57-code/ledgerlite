"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "../../../src/lib/ui-button";
import { Input } from "../../../src/lib/ui-input";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { Permissions, type PaginatedResponse } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";

type BillListItem = {
  id: string;
  systemNumber?: string | null;
  billNumber?: string | null;
  status: string;
  billDate: string;
  dueDate: string;
  total: string | number;
  currency: string;
  vendor: { name: string };
};

const resolveNumber = (bill: BillListItem) => bill.systemNumber ?? bill.billNumber ?? "Draft";

export default function BillsPage() {
  const [bills, setBills] = useState<BillListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.BILL_WRITE);

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

  const loadBills = async (searchValue = search, statusValue = status) => {
    setLoading(true);
    try {
      setActionError(null);
      const result = await apiFetch<PaginatedResponse<BillListItem>>(`/bills${buildQuery(searchValue, statusValue)}`);
      setBills(result.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load bills.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => bills, [bills]);

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Bills</h1>
          <p className="muted">Track vendor bills and post them to AP.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/bills/new">New Bill</Link>
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
            <SelectTrigger aria-label="Bill status">
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
          <Button variant="secondary" onClick={() => loadBills()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p>Loading bills...</p> : null}
      {!loading && rows.length === 0 ? <p>No bills yet. Record your first vendor bill.</p> : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Bill Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((bill) => (
              <TableRow key={bill.id}>
                <TableCell>
                  <Link href={`/bills/${bill.id}`}>{resolveNumber(bill)}</Link>
                </TableCell>
                <TableCell>
                  <span className={`status-badge ${bill.status.toLowerCase()}`}>{bill.status}</span>
                </TableCell>
                <TableCell>{bill.vendor?.name ?? "-"}</TableCell>
                <TableCell>{formatDate(bill.billDate)}</TableCell>
                <TableCell>{formatDate(bill.dueDate)}</TableCell>
                <TableCell>{formatMoney(bill.total, bill.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
