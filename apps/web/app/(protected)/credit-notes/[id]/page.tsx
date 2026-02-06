"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Permissions } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatDateTime, formatMoney } from "../../../../src/lib/format";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { PostImpactSummary } from "../../../../src/lib/ui-post-impact-summary";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { LockDateWarning, isDateLocked } from "../../../../src/lib/ui-lock-warning";
import { usePermissions } from "../../../../src/features/auth/use-permissions";

type CreditNoteLineRecord = {
  id: string;
  description: string;
  qty: string | number;
  unitPrice: string | number;
  discountAmount: string | number;
  lineTax: string | number;
  lineTotal: string | number;
  item?: { id: string; name: string } | null;
  taxCode?: { id: string; name: string } | null;
};

type CreditNoteRecord = {
  id: string;
  number?: string | null;
  status: string;
  customerId: string;
  invoiceId?: string | null;
  creditNoteDate: string;
  currency: string;
  exchangeRate?: string | number | null;
  subTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  reference?: string | null;
  notes?: string | null;
  postedAt?: string | null;
  voidedAt?: string | null;
  updatedAt?: string | null;
  customer?: { id: string; name: string } | null;
  lines: CreditNoteLineRecord[];
};

type OrgSettingsResponse = {
  baseCurrency?: string;
  orgSettings?: { lockDate?: string | null };
};

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const creditNoteId = params?.id ?? "";
  const { hasPermission } = usePermissions();
  const canPost = hasPermission(Permissions.INVOICE_POST);

  const [creditNote, setCreditNote] = useState<CreditNoteRecord | null>(null);
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<unknown>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<unknown>(null);

  const loadCreditNote = useCallback(async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, record] = await Promise.all([
        apiFetch<OrgSettingsResponse>("/orgs/current"),
        apiFetch<CreditNoteRecord>(`/credit-notes/${creditNoteId}`),
      ]);
      setLockDate(org.orgSettings?.lockDate ? new Date(org.orgSettings.lockDate) : null);
      setCreditNote(record);
    } catch (err) {
      setActionError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to load credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setLoading(false);
    }
  }, [creditNoteId]);

  useEffect(() => {
    if (!creditNoteId) {
      return;
    }
    loadCreditNote();
  }, [creditNoteId, loadCreditNote]);

  const handlePost = async () => {
    if (!creditNote) {
      return;
    }
    setPosting(true);
    try {
      setPostError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/post`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setPostDialogOpen(false);
      toast({ title: "Credit note posted", description: "Ledger entries were created." });
    } catch (err) {
      setPostError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to post credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!creditNote) {
      return;
    }
    setVoiding(true);
    try {
      setVoidError(null);
      const updated = await apiFetch<CreditNoteRecord>(`/credit-notes/${creditNote.id}/void`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setCreditNote(updated);
      setVoidDialogOpen(false);
      toast({ title: "Credit note voided", description: "A reversal entry has been created." });
    } catch (err) {
      setVoidError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to void credit note",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setVoiding(false);
    }
  };

  const lineRows = useMemo(() => creditNote?.lines ?? [], [creditNote?.lines]);

  if (loading) {
    return <div className="card">Loading credit note...</div>;
  }

  if (!creditNote) {
    const fallbackMessage = actionError ? normalizeError(actionError).message : "Credit note not found.";
    return (
      <div className="card">
        <PageHeader title="Credit Notes" heading="Credit Note" description={fallbackMessage} icon={<FileText className="h-5 w-5" />} />
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>Back to Credit Notes</Button>
      </div>
    );
  }

  const isPosted = creditNote.status === "POSTED";
  const isDraft = creditNote.status === "DRAFT";
  const creditNoteDate = creditNote.creditNoteDate ? new Date(creditNote.creditNoteDate) : null;
  const isLocked = isDateLocked(lockDate, creditNoteDate ?? undefined);
  const lastSavedAt = creditNote.updatedAt ? formatDateTime(creditNote.updatedAt) : null;
  const postedAt = creditNote.postedAt ? formatDateTime(creditNote.postedAt) : null;
  const voidedAt = creditNote.voidedAt ? formatDateTime(creditNote.voidedAt) : null;

  return (
    <div className="card">
      <PageHeader
        title="Credit Notes"
        heading={creditNote.number ?? "Credit Note"}
        description={`${creditNote.customer?.name ?? "Customer"} | ${creditNote.currency}`}
        icon={<FileText className="h-5 w-5" />}
        meta={
          <>
            {lastSavedAt ? <p className="muted">Last saved at {lastSavedAt}</p> : null}
            {postedAt ? <p className="muted">Posted at {postedAt}</p> : null}
            {voidedAt ? <p className="muted">Voided at {voidedAt}</p> : null}
          </>
        }
        actions={<StatusChip status={creditNote.status} />}
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={() => loadCreditNote()} /> : null}
      <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="posting and voiding" />

      <div className="form-grid">
        <div>
          <p className="muted">Credit Note Date</p>
          <p>{formatDate(creditNote.creditNoteDate)}</p>
        </div>
        <div>
          <p className="muted">Customer</p>
          <p>{creditNote.customer?.name ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Reference</p>
          <p>{creditNote.reference ?? "-"}</p>
        </div>
        <div>
          <p className="muted">Subtotal</p>
          <p>{formatMoney(creditNote.subTotal, creditNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Tax</p>
          <p>{formatMoney(creditNote.taxTotal, creditNote.currency)}</p>
        </div>
        <div>
          <p className="muted">Total</p>
          <p>{formatMoney(creditNote.total, creditNote.currency)}</p>
        </div>
      </div>

      {creditNote.notes ? (
        <>
          <div style={{ height: 12 }} />
          <p className="muted">Notes</p>
          <p>{creditNote.notes}</p>
        </>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <h2>Line items</h2>
      </div>
      {lineRows.length === 0 ? <p className="muted">No line items found.</p> : null}
      {lineRows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineRows.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.item?.name ?? "-"}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell>{line.qty}</TableCell>
                <TableCell>{formatMoney(line.unitPrice, creditNote.currency)}</TableCell>
                <TableCell>{formatMoney(line.discountAmount ?? 0, creditNote.currency)}</TableCell>
                <TableCell>
                  {line.taxCode?.name
                    ? `${line.taxCode.name} (${formatMoney(line.lineTax ?? 0, creditNote.currency)})`
                    : formatMoney(line.lineTax ?? 0, creditNote.currency)}
                </TableCell>
                <TableCell>{formatMoney(line.lineTotal ?? 0, creditNote.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <Button variant="secondary" onClick={() => router.push("/credit-notes")}>Back to Credit Notes</Button>
        {isDraft && canPost ? (
          <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLocked}>Post Credit Note</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Post credit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="posting" />
              <PostImpactSummary mode="post" />
              {postError ? <ErrorBanner error={postError} /> : null}
              <div style={{ height: 12 }} />
              <Button type="button" onClick={handlePost} disabled={posting || isLocked}>
                {posting ? "Posting..." : "Confirm Post"}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
        {isPosted && canPost ? (
          <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isLocked || voiding}>
                Void Credit Note
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void credit note</DialogTitle>
              </DialogHeader>
              <LockDateWarning lockDate={lockDate} docDate={creditNoteDate ?? undefined} actionLabel="voiding" />
              <PostImpactSummary mode="void" />
              {voidError ? <ErrorBanner error={voidError} /> : null}
              <div style={{ height: 12 }} />
              <Button type="button" variant="destructive" onClick={handleVoid} disabled={voiding || isLocked}>
                {voiding ? "Voiding..." : "Confirm Void"}
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}
