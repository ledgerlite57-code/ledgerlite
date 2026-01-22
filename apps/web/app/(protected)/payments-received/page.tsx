"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "../../../src/lib/ui-button";
import { Input } from "../../../src/lib/ui-input";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { apiFetch } from "../../../src/lib/api";
import { Permissions } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";

type PaymentListItem = {
  id: string;
  number?: string | null;
  status: string;
  paymentDate: string;
  amountTotal: string | number;
  currency: string;
  customer: { name: string };
};

export default function PaymentsReceivedPage() {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(Permissions.PAYMENT_RECEIVED_WRITE);

  const buildQuery = (searchValue: string, statusValue: string) => {
    const params = new URLSearchParams();
    if (searchValue.trim()) {
      params.set("search", searchValue.trim());
    }
    if (statusValue !== "all") {
      params.set("status", statusValue);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const loadPayments = async (searchValue = search, statusValue = status) => {
    setLoading(true);
    try {
      setActionError(null);
      const data = await apiFetch<PaymentListItem[]>(`/payments-received${buildQuery(searchValue, statusValue)}`);
      setPayments(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => payments, [payments]);

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Payments Received</h1>
          <p className="muted">Record and post customer payments.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/payments-received/new">Receive Payment</Link>
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
            <SelectTrigger aria-label="Payment status">
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
          <Button variant="secondary" onClick={() => loadPayments()}>
            Apply Filters
          </Button>
        </div>
      </div>
      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p>Loading payments...</p> : null}
      {!loading && rows.length === 0 ? <p>No payments yet. Record your first payment.</p> : null}
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
                  <span className={`status-badge ${payment.status.toLowerCase()}`}>{payment.status}</span>
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
