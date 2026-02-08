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
import { EmptyState } from "../../../../src/lib/ui-empty-state";
import { HelpDrawer, HelpSection, TermHint } from "../../../../src/lib/ui-help-drawer";

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
  matched?: boolean;
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
  amount: string | number;
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
const DAY_MS = 24 * 60 * 60 * 1000;

type SuggestionConfidence = "HIGH" | "MEDIUM" | "LOW";
type TransactionSuggestion = {
  header: GLHeaderRecord;
  confidence: SuggestionConfidence;
  amountDelta: bigint;
  dateDelta: number;
  score: number;
  reasons: string[];
};

function resolveConfidence(score: number): SuggestionConfidence {
  if (score >= 80) {
    return "HIGH";
  }
  if (score >= 50) {
    return "MEDIUM";
  }
  return "LOW";
}

function rankSuggestion(
  transaction: BankTransactionRecord,
  header: GLHeaderRecord,
  transactionAbsToMatch: bigint,
): TransactionSuggestion {
  const headerAbs = absCents(toCents(header.totalDebit ?? header.totalCredit ?? 0));
  const amountDelta = absCents(headerAbs - transactionAbsToMatch);
  const dateDelta = Math.abs(new Date(header.postingDate).getTime() - new Date(transaction.txnDate).getTime());
  const bps = transactionAbsToMatch === 0n ? 0n : (amountDelta * 10000n) / transactionAbsToMatch;

  let score = 0;
  const reasons: string[] = [];
  if (amountDelta === 0n) {
    score += 55;
    reasons.push("Exact amount");
  } else if (bps <= 100n) {
    score += 35;
    reasons.push("Within 1% amount");
  } else if (bps <= 300n) {
    score += 20;
    reasons.push("Within 3% amount");
  }

  if (dateDelta <= DAY_MS * 2) {
    score += 25;
    reasons.push("Date within 2 days");
  } else if (dateDelta <= DAY_MS * 7) {
    score += 15;
    reasons.push("Date within 7 days");
  } else if (dateDelta <= DAY_MS * 14) {
    score += 8;
    reasons.push("Date within 14 days");
  }

  const externalRef = transaction.externalRef?.trim().toLowerCase();
  const memo = header.memo?.toLowerCase() ?? "";
  if (externalRef && memo.includes(externalRef)) {
    score += 20;
    reasons.push("Reference match");
  }

  return {
    header,
    confidence: resolveConfidence(score),
    amountDelta,
    dateDelta,
    score,
    reasons,
  };
}

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
  const [queueFilter, setQueueFilter] = useState<"ALL" | "SUGGESTED" | "EXCEPTIONS">("ALL");

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

  const availableHeaders = useMemo(() => {
    const currency = session?.bankAccount?.currency;
    if (!currency) {
      return glHeaders;
    }
    return glHeaders.filter((header) => header.currency === currency);
  }, [glHeaders, session?.bankAccount?.currency]);

  const matchedAmountByTransactionId = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const match of session?.matches ?? []) {
      const transactionId = match.bankTransaction?.id;
      if (!transactionId) {
        continue;
      }
      const amount = toCents(match.amount ?? 0);
      map.set(transactionId, (map.get(transactionId) ?? 0n) + amount);
    }
    return map;
  }, [session?.matches]);

  const matchedHeaderIdsByTransactionId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const match of session?.matches ?? []) {
      const transactionId = match.bankTransaction?.id;
      const headerId = match.glHeader?.id;
      if (!transactionId || !headerId) {
        continue;
      }
      const existing = map.get(transactionId) ?? new Set<string>();
      existing.add(headerId);
      map.set(transactionId, existing);
    }
    return map;
  }, [session?.matches]);

  const remainingAmountByTransactionId = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const transaction of bankTransactions) {
      const transactionAmount = toCents(transaction.amount);
      const matchedAmount = matchedAmountByTransactionId.get(transaction.id) ?? 0n;
      map.set(transaction.id, transactionAmount - matchedAmount);
    }
    return map;
  }, [bankTransactions, matchedAmountByTransactionId]);

  const matchedAmountAbsByTransactionId = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const transaction of bankTransactions) {
      const matchedAmount = matchedAmountByTransactionId.get(transaction.id) ?? 0n;
      map.set(transaction.id, absCents(matchedAmount));
    }
    return map;
  }, [bankTransactions, matchedAmountByTransactionId]);

  const remainingAmountAbsByTransactionId = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const transaction of bankTransactions) {
      const remainingAmount = remainingAmountByTransactionId.get(transaction.id) ?? toCents(transaction.amount);
      map.set(transaction.id, absCents(remainingAmount));
    }
    return map;
  }, [bankTransactions, remainingAmountByTransactionId]);

  const unmatchedTransactions = useMemo(
    () =>
      bankTransactions.filter((transaction) => {
        const remainingAmount = remainingAmountAbsByTransactionId.get(transaction.id) ?? absCents(toCents(transaction.amount));
        return remainingAmount > 0n;
      }),
    [bankTransactions, remainingAmountAbsByTransactionId],
  );

  const filteredHeaders = useMemo(() => {
    const term = headerSearch.trim().toLowerCase();
    const usedHeaderIds =
      selectedTransaction && matchedHeaderIdsByTransactionId.has(selectedTransaction.id)
        ? matchedHeaderIdsByTransactionId.get(selectedTransaction.id)
        : undefined;
    const searchableHeaders = usedHeaderIds
      ? availableHeaders.filter((header) => !usedHeaderIds.has(header.id))
      : availableHeaders;
    if (!term) {
      return searchableHeaders;
    }
    return searchableHeaders.filter((header) => {
      const label = formatHeaderLabel(header).toLowerCase();
      return (
        label.includes(term) ||
        header.sourceType?.toLowerCase().includes(term) ||
        header.memo?.toLowerCase().includes(term)
      );
    });
  }, [availableHeaders, headerSearch, matchedHeaderIdsByTransactionId, selectedTransaction]);

  useEffect(() => {
    if (!selectedHeaderId) {
      return;
    }
    if (filteredHeaders.some((header) => header.id === selectedHeaderId)) {
      return;
    }
    setSelectedHeaderId("");
  }, [filteredHeaders, selectedHeaderId]);

  const suggestions = useMemo(() => {
    if (!selectedTransaction) {
      return [];
    }
    const remainingAmountAbs =
      remainingAmountAbsByTransactionId.get(selectedTransaction.id) ?? absCents(toCents(selectedTransaction.amount));
    return filteredHeaders
      .map((header) => rankSuggestion(selectedTransaction, header, remainingAmountAbs))
      .sort((a, b) => {
        if (a.score === b.score) {
          if (a.amountDelta === b.amountDelta) {
            return a.dateDelta - b.dateDelta;
          }
          return a.amountDelta < b.amountDelta ? -1 : 1;
        }
        return b.score - a.score;
      })
      .slice(0, 5);
  }, [filteredHeaders, remainingAmountAbsByTransactionId, selectedTransaction]);

  const suggestionsByTransaction = useMemo(() => {
    const map = new Map<string, TransactionSuggestion>();
    for (const transaction of unmatchedTransactions) {
      const remainingAmountAbs =
        remainingAmountAbsByTransactionId.get(transaction.id) ?? absCents(toCents(transaction.amount));
      const usedHeaderIds = matchedHeaderIdsByTransactionId.get(transaction.id);
      const ranked = availableHeaders
        .filter((header) => !usedHeaderIds?.has(header.id))
        .map((header) => rankSuggestion(transaction, header, remainingAmountAbs))
        .sort((a, b) => {
          if (a.score === b.score) {
            if (a.amountDelta === b.amountDelta) {
              return a.dateDelta - b.dateDelta;
            }
            return a.amountDelta < b.amountDelta ? -1 : 1;
          }
          return b.score - a.score;
        });
      if (ranked.length === 0) {
        continue;
      }
      map.set(transaction.id, ranked[0]);
    }
    return map;
  }, [availableHeaders, matchedHeaderIdsByTransactionId, remainingAmountAbsByTransactionId, unmatchedTransactions]);

  const filteredUnmatchedTransactions = useMemo(() => {
    if (queueFilter === "ALL") {
      return unmatchedTransactions;
    }
    if (queueFilter === "SUGGESTED") {
      return unmatchedTransactions.filter((transaction) => {
        const suggestion = suggestionsByTransaction.get(transaction.id);
        return suggestion?.confidence === "HIGH" || suggestion?.confidence === "MEDIUM";
      });
    }
    return unmatchedTransactions.filter((transaction) => {
      const suggestion = suggestionsByTransaction.get(transaction.id);
      return !suggestion || suggestion.confidence === "LOW";
    });
  }, [queueFilter, suggestionsByTransaction, unmatchedTransactions]);

  const exceptionTransactions = useMemo(
    () =>
      unmatchedTransactions.filter((transaction) => {
        const suggestion = suggestionsByTransaction.get(transaction.id);
        return !suggestion || suggestion.confidence === "LOW";
      }),
    [suggestionsByTransaction, unmatchedTransactions],
  );

  const matchedTransactionCount = bankTransactions.length - unmatchedTransactions.length;
  const fullyMatchedTransactionCount = useMemo(
    () => bankTransactions.filter((transaction) => remainingAmountAbsByTransactionId.get(transaction.id) === 0n).length,
    [bankTransactions, remainingAmountAbsByTransactionId],
  );
  const matchedTotalCents = useMemo(
    () => (session?.matches ?? []).reduce((sum, match) => sum + toCents(match.amount ?? 0), 0n),
    [session?.matches],
  );
  const statementDifferenceCents = useMemo(() => {
    if (!session) {
      return 0n;
    }
    return toCents(session.statementOpeningBalance ?? 0) + matchedTotalCents - toCents(session.statementClosingBalance ?? 0);
  }, [matchedTotalCents, session]);

  const selectedRemainingAbs = useMemo(() => {
    if (!selectedTransaction) {
      return 0n;
    }
    return remainingAmountAbsByTransactionId.get(selectedTransaction.id) ?? absCents(toCents(selectedTransaction.amount));
  }, [remainingAmountAbsByTransactionId, selectedTransaction]);

  const selectedMatchedAbs = useMemo(() => {
    if (!selectedTransaction) {
      return 0n;
    }
    return matchedAmountAbsByTransactionId.get(selectedTransaction.id) ?? 0n;
  }, [matchedAmountAbsByTransactionId, selectedTransaction]);

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

  const openMatchDialog = (transaction: BankTransactionRecord, presetHeaderId?: string) => {
    const remainingAmount = remainingAmountAbsByTransactionId.get(transaction.id) ?? absCents(toCents(transaction.amount));
    setSelectedTransaction(transaction);
    setSelectedHeaderId(presetHeaderId ?? "");
    setMatchError(null);
    setHeaderSearch("");
    setMatchAmount(formatBigIntDecimal(remainingAmount, 2));
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
    const remainingAmount =
      remainingAmountByTransactionId.get(selectedTransaction.id) ?? toCents(selectedTransaction.amount);
    const remainingAbs = absCents(remainingAmount);
    const requestedAbs = matchAmount.trim() ? absCents(toCents(matchAmount)) : remainingAbs;
    if (requestedAbs <= 0n) {
      setMatchError("Enter a match amount greater than 0.");
      return;
    }
    if (requestedAbs > remainingAbs) {
      setMatchError("Match amount cannot exceed the remaining transaction balance.");
      return;
    }
    const isPartial = requestedAbs !== remainingAbs;
    const signedAmount = remainingAmount < 0n ? -requestedAbs : requestedAbs;
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

  const applyPercentMatch = (percent: number) => {
    if (!selectedTransaction) {
      return;
    }
    const remainingAmount = remainingAmountAbsByTransactionId.get(selectedTransaction.id) ?? absCents(toCents(selectedTransaction.amount));
    const scaled = (remainingAmount * BigInt(percent)) / 100n;
    setMatchAmount(formatBigIntDecimal(scaled, 2));
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
            <HelpDrawer
              title="Reconciliation Session Help"
              summary="Use smart suggestions for quick matches, then resolve exceptions."
              buttonLabel="What this means"
            >
              <HelpSection label="Queue filters">
                <p>
                  <TermHint term="Suggested" hint="High/medium confidence matches based on date and amount." /> gives the
                  fastest items first. Use <TermHint term="Exceptions" hint="Low-confidence or no-suggestion items." /> for
                  manual review.
                </p>
              </HelpSection>
              <HelpSection label="Split matching">
                <p>Set a smaller match amount when one bank transaction should map to multiple ledger entries.</p>
              </HelpSection>
              <HelpSection label="Close rule">
                <p>Close only when outstanding differences are resolved and the statement closing balance is confirmed.</p>
              </HelpSection>
            </HelpDrawer>
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
            {matchedTransactionCount} of {bankTransactions.length}
          </p>
          <p className="muted text-xs">Fully matched: {fullyMatchedTransactionCount}</p>
        </div>
        <div>
          <p className="muted">Matched Amount</p>
          <p>{formatMoney(formatBigIntDecimal(matchedTotalCents, 2), bankCurrency)}</p>
        </div>
        <div>
          <p className="muted">Statement Difference</p>
          <p className={statementDifferenceCents === 0n ? "muted" : "form-error"}>
            {formatMoney(formatBigIntDecimal(statementDifferenceCents, 2), bankCurrency)}
          </p>
        </div>
      </div>

      <div style={{ height: 16 }} />
      <div className="section-header">
        <h2>Unmatched Transactions</h2>
      </div>
      {unmatchedTransactions.length > 0 ? (
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <Button variant={queueFilter === "ALL" ? "default" : "secondary"} onClick={() => setQueueFilter("ALL")}>
            All ({unmatchedTransactions.length})
          </Button>
          <Button
            variant={queueFilter === "SUGGESTED" ? "default" : "secondary"}
            onClick={() => setQueueFilter("SUGGESTED")}
          >
            Suggested (
            {
              unmatchedTransactions.filter((transaction) => {
                const suggestion = suggestionsByTransaction.get(transaction.id);
                return suggestion?.confidence === "HIGH" || suggestion?.confidence === "MEDIUM";
              }).length
            }
            )
          </Button>
          <Button
            variant={queueFilter === "EXCEPTIONS" ? "default" : "secondary"}
            onClick={() => setQueueFilter("EXCEPTIONS")}
          >
            Exceptions ({exceptionTransactions.length})
          </Button>
        </div>
      ) : null}
      {unmatchedTransactions.length === 0 ? (
        <EmptyState
          title="All transactions are matched"
          description="Great. You can review matched lines and close the session when ready."
        />
      ) : null}
      {filteredUnmatchedTransactions.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Matched So Far</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead>External Ref</TableHead>
              <TableHead>Suggestion</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUnmatchedTransactions.map((transaction) => {
              const suggestion = suggestionsByTransaction.get(transaction.id);
              const matchedSoFar = matchedAmountAbsByTransactionId.get(transaction.id) ?? 0n;
              const remaining = remainingAmountAbsByTransactionId.get(transaction.id) ?? absCents(toCents(transaction.amount));
              const isPartial = matchedSoFar > 0n;
              return (
              <TableRow key={transaction.id}>
                <TableCell>{formatDate(transaction.txnDate)}</TableCell>
                <TableCell>{transaction.description}</TableCell>
                <TableCell>{formatMoney(transaction.amount, transaction.currency)}</TableCell>
                <TableCell>{formatMoney(formatBigIntDecimal(matchedSoFar, 2), transaction.currency)}</TableCell>
                <TableCell>
                  {formatMoney(formatBigIntDecimal(remaining, 2), transaction.currency)}
                  {isPartial ? <p className="muted text-xs">Partial match</p> : null}
                </TableCell>
                <TableCell>{transaction.externalRef ?? "-"}</TableCell>
                <TableCell>
                  {suggestion ? (
                    <>
                      <span className="muted">
                        {suggestion.confidence} ({suggestion.score}) - {suggestion.header.sourceType} (
                        {formatDate(suggestion.header.postingDate)})
                      </span>
                      <p className="muted text-xs">
                        Delta {formatMoney(formatBigIntDecimal(suggestion.amountDelta, 2), transaction.currency)} -{" "}
                        {Math.max(0, Math.round(suggestion.dateDelta / DAY_MS))} day gap
                      </p>
                    </>
                  ) : (
                    <span className="muted">No suggestion</span>
                  )}
                </TableCell>
                <TableCell>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button variant="secondary" onClick={() => openMatchDialog(transaction)} disabled={isClosed}>
                      Match
                    </Button>
                    {suggestion ? (
                      <Button
                        variant="secondary"
                        onClick={() => openMatchDialog(transaction, suggestion.header.id)}
                        disabled={isClosed}
                      >
                        Use Suggestion
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            )})}
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
              <p className="muted text-xs">
                Matched so far: {formatMoney(formatBigIntDecimal(selectedMatchedAbs, 2), selectedTransaction.currency)}
              </p>
              <p className="muted text-xs">
                Remaining to match: {formatMoney(formatBigIntDecimal(selectedRemainingAbs, 2), selectedTransaction.currency)}
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
                      {suggestions.map((suggestion) => (
                        <Button
                          key={suggestion.header.id}
                          type="button"
                          variant={suggestion.header.id === selectedHeaderId ? "default" : "secondary"}
                          onClick={() => setSelectedHeaderId(suggestion.header.id)}
                        >
                          {suggestion.confidence} ({suggestion.score}) - {formatHeaderLabel(suggestion.header)}
                          {suggestion.reasons.length > 0 ? ` - ${suggestion.reasons.slice(0, 2).join(", ")}` : ""}
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
                  id="field-matchamount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={matchAmount}
                  onChange={(event) => setMatchAmount(event.target.value)}
                />
                <p className="muted">Defaults to the remaining amount. Use a smaller value for a split match.</p>
              </label>
              <div className="chip-row">
                <Button type="button" variant="secondary" onClick={() => applyPercentMatch(100)}>
                  100%
                </Button>
                <Button type="button" variant="secondary" onClick={() => applyPercentMatch(75)}>
                  75%
                </Button>
                <Button type="button" variant="secondary" onClick={() => applyPercentMatch(50)}>
                  50%
                </Button>
                <Button type="button" variant="secondary" onClick={() => applyPercentMatch(25)}>
                  25%
                </Button>
              </div>
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
      {exceptionTransactions.length > 0 ? (
        <>
          <div style={{ height: 16 }} />
          <div className="section-header">
            <h2>Exceptions to Review</h2>
          </div>
          <EmptyState
            title={`${exceptionTransactions.length} transactions need manual review`}
            description="These lines have low-confidence matching suggestions. Confirm references, dates, or create adjustment entries."
          />
        </>
      ) : null}
    </div>
  );
}
