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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.INVOICE_WRITE);

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

  const loadInvoices = async (searchValue = search, statusValue = status) => {
    setLoading(true);
    try {
      setActionError(null);
      const result = await apiFetch<PaginatedResponse<InvoiceListItem>>(
        `/invoices${buildQuery(searchValue, statusValue)}`,
      );
      setInvoices(result.data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => invoices, [invoices]);

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="muted">Draft and post customer invoices.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/invoices/new">New Invoice</Link>
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
            <SelectTrigger aria-label="Invoice status">
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
          <Button variant="secondary" onClick={() => loadInvoices()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p>Loading invoices...</p> : null}
      {!loading && rows.length === 0 ? <p>No invoices yet. Create your first invoice.</p> : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Invoice Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link href={`/invoices/${invoice.id}`}>{invoice.number ?? "Draft"}</Link>
                </TableCell>
                <TableCell>
                  <span className={`status-badge ${invoice.status.toLowerCase()}`}>{invoice.status}</span>
                </TableCell>
                <TableCell>{invoice.customer?.name ?? "-"}</TableCell>
                <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                <TableCell>{formatMoney(invoice.total, invoice.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
