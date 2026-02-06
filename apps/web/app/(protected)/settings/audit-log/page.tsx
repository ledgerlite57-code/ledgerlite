"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import { Permissions, auditLogQuerySchema, type AuditLogQueryInput, type PaginatedResponse } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate } from "../../../../src/lib/format";
import { Shield } from "lucide-react";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../src/lib/ui-dialog";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { PageHeader } from "../../../../src/lib/ui-page-header";

type AuditLogRecord = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  actor?: { id: string; email: string } | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

const formatDateInput = (value?: Date) => {
  if (!value) {
    return "";
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function AuditLogPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.AUDIT_VIEW);

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [pageInfo, setPageInfo] = useState<{ page: number; pageSize: number; total: number }>({
    page: 1,
    pageSize: 20,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const form = useForm<AuditLogQueryInput>({
    resolver: zodResolver(auditLogQuerySchema),
    defaultValues: {
      from: undefined,
      to: undefined,
      entityType: "",
      actor: "",
    },
  });

  const loadLogs = useCallback(
    async (values: AuditLogQueryInput, pageOverride?: number) => {
      setLoading(true);
      try {
        setActionError(null);
        const page = pageOverride ?? pageInfo.page;
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageInfo.pageSize));
        if (values.from) {
          params.set("from", values.from.toISOString());
        }
        if (values.to) {
          params.set("to", values.to.toISOString());
        }
        if (values.entityType) {
          params.set("entityType", values.entityType);
        }
        if (values.actor) {
          params.set("actor", values.actor);
        }
        const query = params.toString();
        const data = await apiFetch<PaginatedResponse<AuditLogRecord>>(`/audit-logs?${query}`);
        setLogs(data.data);
        setPageInfo(data.pageInfo);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load audit logs.");
      } finally {
        setLoading(false);
      }
    },
    [pageInfo.page, pageInfo.pageSize],
  );

  useEffect(() => {
    loadLogs(form.getValues());
  }, [form, loadLogs]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(pageInfo.total / pageInfo.pageSize)), [pageInfo]);

  const handleFilterSubmit = (values: AuditLogQueryInput) => {
    setPageInfo((prev) => ({ ...prev, page: 1 }));
    loadLogs(values, 1);
  };

  const handlePageChange = (nextPage: number) => {
    setPageInfo((prev) => ({ ...prev, page: nextPage }));
    loadLogs(form.getValues(), nextPage);
  };

  const handleResetFilters = () => {
    form.reset({ from: undefined, to: undefined, entityType: "", actor: "" });
    setPageInfo((prev) => ({ ...prev, page: 1 }));
    loadLogs(form.getValues(), 1);
  };

  const copyJson = (value: unknown) => {
    const text = value ? JSON.stringify(value, null, 2) : "-";
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  };

  const openDetails = (log: AuditLogRecord) => {
    setSelectedLog(log);
    setDetailOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedLog(null);
    }
  };

  if (!canView) {
    return (
      <div className="card">
        <PageHeader
          title="Settings"
          heading="Audit Log"
          description="You do not have permission to view audit logs."
          icon={<Shield className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Settings"
        heading="Audit Log"
        description="Immutable audit trail of critical actions."
        icon={<Shield className="h-5 w-5" />}
      />

      <form onSubmit={form.handleSubmit(handleFilterSubmit)}>
        <div className="filter-row">
          <label>
            From
            <Controller
              control={form.control}
              name="from"
              render={({ field }) => (
                <Input
                  type="date"
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.from?.message)}
          </label>
          <label>
            To
            <Controller
              control={form.control}
              name="to"
              render={({ field }) => (
                <Input
                  type="date"
                  value={formatDateInput(field.value)}
                  onChange={(event) => field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
                />
              )}
            />
            {renderFieldError(form.formState.errors.to?.message)}
          </label>
          <label>
            Entity Type
            <Input {...form.register("entityType")} placeholder="INVOICE, BILL, USER..." />
          </label>
          <label>
            Actor
            <Input {...form.register("actor")} placeholder="user email or id" />
          </label>
          <div>
            <Button type="submit" disabled={loading}>
              {loading ? "Loading..." : "Apply Filters"}
            </Button>
          </div>
          <div>
            <Button type="button" variant="ghost" onClick={handleResetFilters} disabled={loading}>
              Reset
            </Button>
          </div>
        </div>
      </form>

      <div style={{ height: 12 }} />
      {actionError ? <p className="form-error">{actionError}</p> : null}

      {logs.length === 0 && !loading ? <p className="muted">No audit logs found.</p> : null}

      {logs.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatDate(log.createdAt)}</TableCell>
                <TableCell>{log.actor?.email ?? "System"}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entityType}</TableCell>
                <TableCell>{log.entityId}</TableCell>
                <TableCell>
                  <Button variant="secondary" onClick={() => openDetails(log)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div style={{ height: 12 }} />
      <div className="section-header">
        <div className="muted">
          Page {pageInfo.page} of {pageCount}
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

      <Dialog open={detailOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit log details</DialogTitle>
          </DialogHeader>
          {selectedLog ? (
            <>
              <p className="muted">
                {selectedLog.entityType} - {selectedLog.action}
              </p>
              <div style={{ height: 12 }} />
              <div className="form-grid">
                <div>
                  <p className="muted">Entity ID</p>
                  <p>{selectedLog.entityId}</p>
                </div>
                <div>
                  <p className="muted">Actor</p>
                  <p>{selectedLog.actor?.email ?? "System"}</p>
                </div>
                <div>
                  <p className="muted">Request ID</p>
                  <p>{selectedLog.requestId ?? "-"}</p>
                </div>
                <div>
                  <p className="muted">IP</p>
                  <p>{selectedLog.ip ?? "-"}</p>
                </div>
              </div>
              <div style={{ height: 12 }} />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p className="muted">Before</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => copyJson(selectedLog.before)}>
                    Copy
                  </Button>
                </div>
                <pre className="input" style={{ whiteSpace: "pre-wrap" }}>
                  {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : "-"}
                </pre>
              </div>
              <div style={{ height: 12 }} />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p className="muted">After</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => copyJson(selectedLog.after)}>
                    Copy
                  </Button>
                </div>
                <pre className="input" style={{ whiteSpace: "pre-wrap" }}>
                  {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : "-"}
                </pre>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
