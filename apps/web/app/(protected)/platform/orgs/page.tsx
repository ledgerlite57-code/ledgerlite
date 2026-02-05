"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Permissions } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDateTime } from "../../../../src/lib/format";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type OrgDirectoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  countryCode?: string | null;
  baseCurrency?: string | null;
  vatEnabled: boolean;
  lockDate?: string | null;
  userCount: number;
  onboardingSetupStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  onboardingCompletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function PlatformOrgsPage() {
  const { status, hasAnyPermission } = usePermissions();
  const canView = hasAnyPermission(
    Permissions.PLATFORM_ORG_READ,
    Permissions.PLATFORM_ORG_WRITE,
    Permissions.PLATFORM_IMPERSONATE,
  );

  const [rows, setRows] = useState<OrgDirectoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<OrgDirectoryRow[]>("/orgs/directory");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Unable to load organizations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => row.name.toLowerCase().includes(q) || row.id.toLowerCase().includes(q));
  }, [rows, query]);

  useEffect(() => {
    if (status !== "ready" || !canView) {
      return;
    }
    load();
  }, [status, canView, load]);

  if (status === "loading") {
    return (
      <div className="card">
        <div className="page-header">
          <div>
            <h1>Organizations</h1>
            <p className="muted">Loading platform directory...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="card">
        <div className="page-header">
          <div>
            <h1>Organizations</h1>
            <p className="muted">You do not have access to the platform directory.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Organizations</h1>
          <p className="muted">Platform admin view of all organizations in this environment.</p>
        </div>
        <div style={{ minWidth: 280 }}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search org name or id..."
            aria-label="Search organizations"
          />
        </div>
      </div>

      {error ? <ErrorBanner error={error} onRetry={load} /> : null}

      <div style={{ overflowX: "auto" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Setup</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>VAT</TableHead>
              <TableHead>Lock Date</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <span className="muted">Loading...</span>
                </TableCell>
              </TableRow>
            ) : filtered.length ? (
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <strong>{row.name}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {row.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={row.isActive ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell>
                    <StatusChip
                      status={
                        row.onboardingSetupStatus === "NOT_STARTED"
                          ? "not started"
                          : row.onboardingSetupStatus === "IN_PROGRESS"
                            ? "in progress"
                            : "completed"
                      }
                    />
                  </TableCell>
                  <TableCell>{row.userCount}</TableCell>
                  <TableCell>{row.countryCode ?? "-"}</TableCell>
                  <TableCell>{row.baseCurrency ?? "-"}</TableCell>
                  <TableCell>
                    <StatusChip status={row.vatEnabled ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell>{row.lockDate ? formatDateTime(row.lockDate) : "-"}</TableCell>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9}>
                  <span className="muted">No organizations found.</span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
