"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Permissions } from "@ledgerlite/shared";
import type { ReconciliationCloseInput, ReconciliationMatchInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { formatDate, formatMoney } from "../../../../src/lib/format";
import { formatBigIntDecimal, toCents } from "../../../../src/lib/money";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";

type BankAccountRecord = {
  id: string;
  name: string;
  currency: string;
};

type BankTransactionRecord = {
  id: string;
  txnDate: string;
  description: string;
  amount: string | number;
  currency: string;
  externalRef?: string | null;
};

type GLHeaderRecord = {
  id: string;
  sourceType: string;
  postingDate: string;
  currency: string;
  totalDebit: string | number;
  totalCredit: string | number;
  status: string;
  memo?: string | null;
};

type ReconciliationMatchRecord = {
  id: string;
  matchType: string;
  bankTransaction: BankTransactionRecord;
  glHeader?: GLHeaderRecord | null;
};

type ReconciliationSessionRecord = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  statementOpeningBalance: string | number;
  statementClosingBalance: string | number;
  bankAccount: BankAccountRecord;
  matches: ReconciliationMatchRecord[];
};

type ReconciliationSessionResponse = {
  session: ReconciliationSessionRecord;
  bankTransactions: BankTransactionRecord[];
  glHeaders: GLHeaderRecord[];
};

const formatHeaderLabel = (header: GLHeaderRecord) => {
  const amount = formatMoney(header.totalDebit ?? header.totalCredit ?? 0, header.currency);
  const memo = header.memo?.trim();
  return `${header.sourceType} ${formatDate(header.postingDate)} - ${amount}${memo ? ` - ${memo}` : ""}`;
};

const absCents = (value: bigint) => (value < 0n ? -value : value);

export default function ReconciliationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id ?? "";
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permissions.RECONCILE_MANAGE);

  const [session, setSession] = useState<ReconciliationSessionRecord | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankTransactionRecord[]>([]);
  const [glHeaders, setGlHeaders] = useState<GLHeaderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<unknown>(null);

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransactionRecord | null>(null);
  const [selectedHeaderId, setSelectedHeaderId] = useState("");
  const [headerSearch, setHeaderSearch] = useState("");
  const [matchAmount, setMatchAmount] = useState("");

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeBalance, setCloseBalance] = useState("");

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    try {
      setActionError(null);
      const data = await apiFetch<ReconciliationSessionResponse>(`/reconciliation-sessions/${sessionId}`);
      setSession(data.session);
      setBankTransactions(data.bankTransactions);
      setGlHeaders(data.glHeaders);
    } catch (err) {
      setActionError(err);
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to load reconciliation session",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (session) {
      setCloseBalance(String(session.statementClosingBalance ?? ""));
    }
  }, [session]);

  const matchByTransactionId = useMemo(() => {
    const map = new Map<string, ReconciliationMatchRecord>();
    for (const match of session?.matches ?? []) {
      if (match.bankTransaction?.id) {
        map.set(match.bankTransaction.id, match);
      }
    }
    return map;
  }, [session?.matches]);

  const unmatchedTransactions = useMemo(
    () => bankTransactions.filter((transaction) => !matchByTransactionId.has(transaction.id)),
    [bankTransactions, matchByTransactionId],
  );

  const availableHeaders = useMemo(() => {
    const currency = session?.bankAccount?.currency;
    if (!currency) {
      return glHeaders;
    }
    return glHeaders.filter((header) => header.currency === currency);
  }, [glHeaders, session?.bankAccount?.currency]);

  const filteredHeaders = useMemo(() => {
    const term = headerSearch.trim().toLowerCase();
    if (!term) {
      return availableHeaders;
    }
    return availableHeaders.filter((header) => {
      const label = formatHeaderLabel(header).toLowerCase();
      return (
        label.includes(term) ||
        header.sourceType?.toLowerCase().includes(term) ||
        header.memo?.toLowerCase().includes(term)
      );
    });
  }, [availableHeaders, headerSearch]);

  const suggestions = useMemo(() => {
    if (!selectedTransaction) {
      return [];
    }
    const txnCents = toCents(selectedTransaction.amount);
    const txnAbs = absCents(txnCents);
    const txnDate = new Date(selectedTransaction.txnDate).getTime();
    return availableHeaders
      .map((header) => {
        const headerCents = toCents(header.totalDebit ?? header.totalCredit ?? 0);
        const headerAbs = absCents(headerCents);
        const dateDelta = Math.abs(new Date(header.postingDate).getTime() - txnDate);
        const amountDelta = absCents(headerAbs - txnAbs);
        return { header, dateDelta, amountDelta };
      })
      .sort((a, b) => {
        if (a.amountDelta === b.amountDelta) {
          return a.dateDelta - b.dateDelta;
        }
        return a.amountDelta < b.amountDelta ? -1 : 1;
      })
      .slice(0, 5);
  }, [availableHeaders, selectedTransaction]);

  const handleMatchDialogChange = (open: boolean) => {
    setMatchDialogOpen(open);
    if (!open) {
      setSelectedTransaction(null);
      setSelectedHeaderId("");
      setMatchError(null);
      setHeaderSearch("");
      setMatchAmount("");
    }
  };

  const openMatchDialog = (transaction: BankTransactionRecord) => {
    const txnAbs = absCents(toCents(transaction.amount));
    setSelectedTransaction(transaction);
    setSelectedHeaderId("");
    setMatchError(null);
    setHeaderSearch("");
    setMatchAmount(formatBigIntDecimal(txnAbs, 2));
    setMatchDialogOpen(true);
  };

  const submitMatch = async () => {
    if (!selectedTransaction) {
      return;
    }
    if (!selectedHeaderId) {
      setMatchError("Select a ledger entry to match.");
      return;
    }
    const txnCents = toCents(selectedTransaction.amount);
    const txnAbs = absCents(txnCents);
    const requestedAbs = matchAmount.trim() ? absCents(toCents(matchAmount)) : txnAbs;
    if (requestedAbs <= 0n) {
      setMatchError("Enter a match amount greater than 0.");
      return;
    }
    if (requestedAbs > txnAbs) {
      setMatchError("Match amount cannot exceed the transaction amount.");
      return;
    }
    const isPartial = requestedAbs !== txnAbs;
    const signedAmount = txnCents < 0n ? -requestedAbs : requestedAbs;
    setMatching(true);
    try {
      setMatchError(null);
      const payload: ReconciliationMatchInput = {
        bankTransactionId: selectedTransaction.id,
        glHeaderId: selectedHeaderId,
        matchType: isPartial ? "SPLIT" : "MANUAL",
      };
      if (isPartial) {
        payload.amount = formatBigIntDecimal(signedAmount, 2);
      }
      await apiFetch(`/reconciliation-sessions/${sessionId}/match`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMatchDialogOpen(false);
      setSelectedTransaction(null);
      toast({ title: "Transaction matched", description: "Match recorded successfully." });
      await loadSession();
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Unable to match transaction.");
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to match transaction",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setMatching(false);
    }
  };

  const handleCloseDialogChange = (open: boolean) => {
    setCloseDialogOpen(open);
    if (!open) {
      setCloseError(null);
    }
  };

  const submitClose = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionId) {
      return;
    }
    const trimmed = closeBalance.trim();
    const payload: ReconciliationCloseInput = {};
    if (trimmed) {
      const value = Number(trimmed);
      if (Number.isNaN(value)) {
        setCloseError("Enter a valid closing balance.");
        return;
      }
      payload.statementClosingBalance = value;
    }
    setClosing(true);
    try {
      setCloseError(null);
      await apiFetch(`/reconciliation-sessions/${sessionId}/close`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCloseDialogOpen(false);
      toast({ title: "Session closed", description: "Reconciliation session is now closed." });
      await loadSession();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Unable to close session.");
      const normalized = normalizeError(err);
      toast({
        variant: "destructive",
        title: "Unable to close session",
        description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
      });
    } finally {
      setClosing(false);
    }
  };

  if (!canManage) {
    return (
      <div className="card">
        <h1>Reconciliation</h1>
        <p className="muted">You do not have permission to manage reconciliations.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="card">Loading reconciliation session...</div>;
  }

  if (!session) {
    const fallbackMessage = actionError ? normalizeError(actionError).message : "Reconciliation session not found.";
    return (
      <div className="card">
        <h1>Reconciliation</h1>
        <p className="muted">{fallbackMessage}</p>
      </div>
    );
  }

  const bankCurrency = session.bankAccount?.currency ?? "AED";
  const isClosed = session.status === "CLOSED";

  return (
    <div className="card">
      <PageHeader
        title="Reconciliation"
        heading="Reconciliation Session"
        description={`${session.bankAccount?.name ?? "Bank Account"} (${bankCurrency})`}
        icon={<Scale className="h-5 w-5" />}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => router.push("/reconciliation")}>
              Back to Sessions
            </Button>
            {!isClosed ? (
              <Dialog open={closeDialogOpen} onOpenChange={handleCloseDialogChange}>
                <DialogTrigger asChild>
                  <Button variant="secondary">Close Session</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Close reconciliation session</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitClose}>
                    <label>
                      Statement Closing Balance
                      <Input
                        type="number"
                        step="0.01"
                        value={closeBalance}
                        onChange={(event) => setCloseBalance(event.target.value)}
                      />
                    </label>
                    {closeError ? <p className="form-error">{closeError}</p> : null}
                    <div style={{ height: 12 }} />
                    <Button type="submit" disabled={closing}>
                      {closing ? "Closing..." : "Confirm Close"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        }
      />

      {actionError ? <ErrorBanner error={actionError} onRetry={() => loadSession()} /> : null}

      <div className="form-grid">
        <div>
          <p className="muted">Period</p>
          <p>
            {formatDate(session.periodStart)} to {formatDate(session.periodEnd)}
          </p>
        </div>
        <div>
          <p className="muted">Status</p>
          <p>
            <StatusChip status={session.status} />
          </p>
        </div>
        <div>
          <p className="muted">Statement Opening</p>
          <p>{formatMoney(session.statementOpeningBalance ?? 0, bankCurrency)}</p>
        </div>
        <div>
          <p className="muted">Statement Closing</p>
          <p>{formatMoney(session.statementClosingBalance ?? 0, bankCurrency)}</p>
        </div>
        <div>
          <p className="muted">Matched</p>
          <p>
            {session.matches?.length ?? 0} of {bankTransactions.length}
          </p>
        </div>
      </div>

      <div style={{ height: 16 }} />
      <div className="section-header">
        <h2>Unmatched Transactions</h2>
      </div>
      {unmatchedTransactions.length === 0 ? <p className="muted">All transactions are matched.</p> : null}
      {unmatchedTransactions.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>External Ref</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {unmatchedTransactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{formatDate(transaction.txnDate)}</TableCell>
                <TableCell>{transaction.description}</TableCell>
                <TableCell>{formatMoney(transaction.amount, transaction.currency)}</TableCell>
                <TableCell>{transaction.externalRef ?? "-"}</TableCell>
                <TableCell>
                  <Button variant="secondary" onClick={() => openMatchDialog(transaction)} disabled={isClosed}>
                    Match
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <div style={{ height: 16 }} />
      <div className="section-header">
        <h2>Matched Transactions</h2>
      </div>
      {session.matches.length === 0 ? <p className="muted">No matches yet.</p> : null}
      {session.matches.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>Ledger Entry</TableHead>
              <TableHead>Match Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.matches.map((match) => (
              <TableRow key={match.id}>
                <TableCell>
                  {match.bankTransaction?.description ?? "-"} ({formatMoney(match.bankTransaction?.amount ?? 0, bankCurrency)})
                </TableCell>
                <TableCell>
                  {match.glHeader
                    ? `${match.glHeader.sourceType} ${formatDate(match.glHeader.postingDate)}`
                    : "Ledger entry removed"}
                </TableCell>
                <TableCell>{match.matchType}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Dialog open={matchDialogOpen} onOpenChange={handleMatchDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Match transaction</DialogTitle>
          </DialogHeader>
          {selectedTransaction ? (
            <>
              <p className="muted">
                {formatDate(selectedTransaction.txnDate)} - {selectedTransaction.description} (
                {formatMoney(selectedTransaction.amount, selectedTransaction.currency)})
              </p>
              <div style={{ height: 12 }} />
              <label>
                Search ledger entries
                <Input
                  value={headerSearch}
                  onChange={(event) => setHeaderSearch(event.target.value)}
                  placeholder="Search by memo, date, or amount"
                />
              </label>
              {suggestions.length > 0 ? (
                <>
                  <div style={{ height: 8 }} />
                  <div className="card muted">
                    <strong>Suggested matches</strong>
                    <div style={{ height: 6 }} />
                    <div style={{ display: "grid", gap: 6 }}>
                      {suggestions.map(({ header }) => (
                        <Button
                          key={header.id}
                          type="button"
                          variant={header.id === selectedHeaderId ? "default" : "secondary"}
                          onClick={() => setSelectedHeaderId(header.id)}
                        >
                          {formatHeaderLabel(header)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
              <div style={{ height: 12 }} />
              <label>
                Ledger Entry *
                <Select value={selectedHeaderId} onValueChange={setSelectedHeaderId}>
                  <SelectTrigger aria-label="Ledger entry">
                    <SelectValue placeholder="Select ledger entry" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredHeaders.map((header) => (
                      <SelectItem key={header.id} value={header.id}>
                        {formatHeaderLabel(header)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {filteredHeaders.length === 0 ? (
                <p className="muted">No ledger entries match that search.</p>
              ) : null}
              <div style={{ height: 12 }} />
              <label>
                Match Amount
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={matchAmount}
                  onChange={(event) => setMatchAmount(event.target.value)}
                />
                <p className="muted">Defaults to the full transaction amount. Use a smaller value for a split match.</p>
              </label>
              {matchError ? <p className="form-error">{matchError}</p> : null}
              <div style={{ height: 12 }} />
              <Button type="button" onClick={submitMatch} disabled={matching || availableHeaders.length === 0}>
                {matching ? "Matching..." : "Confirm Match"}
              </Button>
            </>
          ) : (
            <p className="muted">Select a transaction to match.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
