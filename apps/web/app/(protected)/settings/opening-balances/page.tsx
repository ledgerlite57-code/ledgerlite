"use client";

import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { accountTypeSchema, Permissions, type AccountCreateInput } from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { Button } from "../../../../src/lib/ui-button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../../src/lib/ui-dialog";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";
import { FormSection } from "../../../../src/lib/ui-form-section";
import { Input } from "../../../../src/lib/ui-input";
import { PageHeader } from "../../../../src/lib/ui-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { StatusChip } from "../../../../src/lib/ui-status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";

const steps = [
  { id: "setup", label: "Setup" },
  { id: "accounts", label: "Accounts" },
  { id: "inventory", label: "Inventory" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
] as const;

type StepId = (typeof steps)[number]["id"];

type AccountType = (typeof accountTypeSchema.options)[number];
type DraftLine = {
  accountId: string;
  debit?: string | number | null;
  credit?: string | number | null;
};

type InventoryDraftLine = {
  itemId: string;
  qty?: string | number | null;
  unitCost?: string | number | null;
};

type DraftRow = {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
};

type InventoryRow = {
  id: string;
  itemId: string;
  qty: string;
  unitCost: string;
};

type StatusResponse = {
  status: "NOT_STARTED" | "DRAFT" | "POSTED";
  baseCurrency?: string | null;
  cutOverDate?: string | null;
  postedAt?: string | null;
  postedBy?: { id: string; email: string } | null;
  draft: {
    lines: DraftLine[];
    inventoryLines: InventoryDraftLine[];
  };
};

type AccountRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  isActive: boolean;
};

type ItemRecord = {
  id: string;
  name: string;
  sku?: string | null;
  type: string;
  isActive?: boolean | null;
};

type PreviewLine = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
  description?: string | null;
};

type PreviewResponse = {
  status: string;
  cutOverDate?: string | null;
  currency?: string | null;
  journalLines: PreviewLine[];
  adjustmentLine?: PreviewLine | null;
  totals: { debit: string; credit: string };
  trialBalancePreview: {
    currency?: string | null;
    totals: { debit: string; credit: string };
    rows: PreviewLine[];
  };
  validations: { level: string; message: string }[];
};

const toInput = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const formatDateInput = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createRowId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function OpeningBalancesPage() {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.ORG_WRITE);

  const [step, setStep] = useState<StepId>("setup");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [cutOverDate, setCutOverDate] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountCreateInput>({
    code: "",
    name: "",
    type: "ASSET",
    isActive: true,
  });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const baseCurrency = status?.baseCurrency ?? "";
  const isPosted = status?.status === "POSTED";

  const displayAccounts = useMemo(
    () =>
      accounts
        .filter((account) => account.isActive)
        .filter((account) => account.subtype !== "AR" && account.subtype !== "AP")
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  );

  const displayItems = useMemo(
    () => items.filter((item) => item.type === "INVENTORY" && item.isActive !== false),
    [items],
  );

  const selectedAccountIds = useMemo(
    () => new Set(draftRows.map((row) => row.accountId).filter(Boolean)),
    [draftRows],
  );

  const selectedItemIds = useMemo(
    () => new Set(inventoryRows.map((row) => row.itemId).filter(Boolean)),
    [inventoryRows],
  );

  const accountTypeOptions = accountTypeSchema.options as AccountType[];

  const loadData = async () => {
    setLoading(true);
    try {
      setError(null);
      const [statusResponse, accountsResponse, itemsResponse] = await Promise.all([
        apiFetch<StatusResponse>("/settings/opening-balances/status"),
        apiFetch<AccountRecord[]>("/accounts"),
        apiFetch<{ data?: ItemRecord[] } | ItemRecord[]>("/items?isActive=true&pageSize=100"),
      ]);

      const itemsData = Array.isArray(itemsResponse) ? itemsResponse : itemsResponse.data ?? [];

      setStatus(statusResponse);
      setAccounts(accountsResponse ?? []);
      setItems(itemsData ?? []);
      setCutOverDate(formatDateInput(statusResponse.cutOverDate));

      const loadedDraftRows = statusResponse.draft.lines.map((line) => ({
        id: createRowId(),
        accountId: line.accountId,
        debit: toInput(line.debit),
        credit: toInput(line.credit),
      }));
      setDraftRows(
        loadedDraftRows.length > 0
          ? loadedDraftRows
          : [{ id: createRowId(), accountId: "", debit: "", credit: "" }],
      );

      const loadedInventoryRows = statusResponse.draft.inventoryLines.map((line) => ({
        id: createRowId(),
        itemId: line.itemId,
        qty: toInput(line.qty),
        unitCost: toInput(line.unitCost),
      }));
      setInventoryRows(
        loadedInventoryRows.length > 0
          ? loadedInventoryRows
          : [{ id: createRowId(), itemId: "", qty: "", unitCost: "" }],
      );

      if (statusResponse.status === "POSTED") {
        setStep("done");
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (step !== "review") {
      return;
    }
    const loadPreview = async () => {
      try {
        setError(null);
        const data = await apiFetch<PreviewResponse>("/settings/opening-balances/preview", { method: "POST" });
        setPreview(data);
      } catch (err) {
        setError(err);
      }
    };
    loadPreview();
  }, [step]);
  const handleCutOverSave = async () => {
    if (!canWrite) {
      return;
    }
    if (!cutOverDate) {
      setError(new Error("Cut-over date is required."));
      return;
    }
    setSaving(true);
    try {
      setError(null);
      await apiFetch("/settings/opening-balances/cut-over", {
        method: "PATCH",
        body: JSON.stringify({ cutOverDate }),
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const updateDraftAccount = (rowId: string, accountId: string) => {
    setDraftRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, accountId } : row)));
  };

  const updateDraftAmount = (rowId: string, field: "debit" | "credit", value: string) => {
    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const updated = { ...row, [field]: value };
        if (field === "debit" && value && Number(value) > 0) {
          updated.credit = "";
        }
        if (field === "credit" && value && Number(value) > 0) {
          updated.debit = "";
        }
        return updated;
      }),
    );
  };

  const addDraftRow = () => {
    setDraftRows((prev) => [...prev, { id: createRowId(), accountId: "", debit: "", credit: "" }]);
  };

  const removeDraftRow = (rowId: string) => {
    setDraftRows((prev) => {
      if (prev.length <= 1) {
        return prev.map((row) =>
          row.id === rowId ? { ...row, accountId: "", debit: "", credit: "" } : row,
        );
      }
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const updateInventoryItem = (rowId: string, itemId: string) => {
    setInventoryRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, itemId } : row)));
  };

  const updateInventoryAmount = (rowId: string, field: "qty" | "unitCost", value: string) => {
    setInventoryRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  };

  const addInventoryRow = () => {
    setInventoryRows((prev) => [...prev, { id: createRowId(), itemId: "", qty: "", unitCost: "" }]);
  };

  const removeInventoryRow = (rowId: string) => {
    setInventoryRows((prev) => {
      if (prev.length <= 1) {
        return prev.map((row) =>
          row.id === rowId ? { ...row, itemId: "", qty: "", unitCost: "" } : row,
        );
      }
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const resetAccountForm = () => {
    setAccountForm({
      code: "",
      name: "",
      type: "ASSET",
      isActive: true,
    });
    setAccountError(null);
  };

  const handleCreateAccount = async () => {
    if (!canWrite) {
      return;
    }
    if (!accountForm.code.trim() || !accountForm.name.trim()) {
      setAccountError("Account code and name are required.");
      return;
    }
    setAccountSaving(true);
    try {
      setAccountError(null);
      const payload: AccountCreateInput = {
        code: accountForm.code.trim(),
        name: accountForm.name.trim(),
        type: accountForm.type,
        isActive: accountForm.isActive,
      };
      const created = await apiFetch<AccountRecord>("/accounts", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setAccounts((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
      setAccountDialogOpen(false);
      resetAccountForm();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setAccountSaving(false);
    }
  };

  const saveDraftLines = async () => {
    if (!canWrite) {
      return;
    }
    setSaving(true);
    try {
      setError(null);
      const invalidRow = draftRows.find((row) => {
        const hasDebit = row.debit && Number(row.debit) > 0;
        const hasCredit = row.credit && Number(row.credit) > 0;
        const hasAccount = Boolean(row.accountId);
        if (!hasAccount && (hasDebit || hasCredit)) {
          return true;
        }
        if (hasAccount && !hasDebit && !hasCredit) {
          return true;
        }
        return false;
      });
      if (invalidRow) {
        throw new Error("Each line must include an account and a debit or credit amount.");
      }

      const lines = draftRows
        .map((row) => ({
          accountId: row.accountId,
          debit: row.debit && Number(row.debit) > 0 ? row.debit : undefined,
          credit: row.credit && Number(row.credit) > 0 ? row.credit : undefined,
        }))
        .filter((line) => line.accountId && (line.debit || line.credit));

      await apiFetch("/settings/opening-balances/draft-lines", {
        method: "PUT",
        body: JSON.stringify({ lines }),
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const saveInventory = async () => {
    if (!canWrite) {
      return;
    }
    setSaving(true);
    try {
      setError(null);
      const invalidRow = inventoryRows.find((row) => {
        const hasQty = row.qty && Number(row.qty) > 0;
        const hasCost = row.unitCost && Number(row.unitCost) > 0;
        const hasItem = Boolean(row.itemId);
        if (!hasItem && (hasQty || hasCost)) {
          return true;
        }
        if (hasItem && (!hasQty || !hasCost)) {
          return true;
        }
        return false;
      });
      if (invalidRow) {
        throw new Error("Each inventory line must include an item, quantity, and unit cost.");
      }

      const lines = inventoryRows
        .map((row) => ({
          itemId: row.itemId,
          qty: row.qty && Number(row.qty) > 0 ? row.qty : undefined,
          unitCost: row.unitCost && Number(row.unitCost) > 0 ? row.unitCost : undefined,
        }))
        .filter((line) => line.itemId && line.qty && line.unitCost);

      await apiFetch("/settings/opening-balances/inventory", {
        method: "PUT",
        body: JSON.stringify({ lines }),
      });
      await loadData();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async () => {
    if (!canWrite) {
      return;
    }
    setPosting(true);
    try {
      setError(null);
      await apiFetch("/settings/opening-balances/post", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      await loadData();
      setStep("done");
    } catch (err) {
      setError(err);
    } finally {
      setPosting(false);
    }
  };

  const canProceed = (target: StepId) => {
    if (isPosted) {
      return true;
    }
    return target !== "done";
  };

  const statusLabel = status?.status ?? "NOT_STARTED";
  if (loading) {
    return (
      <div className="card">
        <PageHeader title="Opening Balances" description="Loading opening balance setup..." />
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Opening Balances"
        description="Import or enter opening balances before you start posting transactions."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="muted">{baseCurrency ? `Base currency: ${baseCurrency}` : null}</div>
            <StatusChip status={statusLabel} />
          </div>
        }
      />

      {error ? <ErrorBanner error={error} onRetry={loadData} /> : null}

      <div className="tab-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {steps.map((stepItem) => (
          <Button
            key={stepItem.id}
            type="button"
            variant={step === stepItem.id ? "default" : "secondary"}
            onClick={() => (canProceed(stepItem.id) ? setStep(stepItem.id) : null)}
            disabled={!canProceed(stepItem.id)}
          >
            {stepItem.label}
          </Button>
        ))}
      </div>

      {step === "setup" ? (
        <FormSection
          title="Cut-over date"
          description="Set the date you want LedgerLite to begin from. Opening balances will post on this date."
        >
          <div className="form-grid" style={{ maxWidth: 420 }}>
            <label>
              Cut-over date *
              <Input
                type="date"
                value={cutOverDate}
                onChange={(event) => setCutOverDate(event.target.value)}
                disabled={!canWrite || isPosted}
              />
            </label>
            <div style={{ marginTop: 12 }}>
              <Button type="button" onClick={handleCutOverSave} disabled={!canWrite || isPosted || saving}>
                {saving ? "Saving..." : "Save cut-over date"}
              </Button>
            </div>
          </div>
        </FormSection>
      ) : null}

      {step === "accounts" ? (
        <FormSection
          title="Account balances"
          description="Enter opening balances for non-AR/AP accounts. Debits or credits only."
        >
          <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button type="button" variant="secondary" onClick={addDraftRow} disabled={!canWrite || isPosted}>
              Add line
            </Button>
            <Dialog
              open={accountDialogOpen}
              onOpenChange={(open) => {
                setAccountDialogOpen(open);
                if (!open) {
                  resetAccountForm();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button type="button" variant="secondary" disabled={!canWrite || isPosted}>
                  Create account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create account</DialogTitle>
                </DialogHeader>
                <div className="form-grid" style={{ gap: 12 }}>
                  {accountError ? <div className="muted">{accountError}</div> : null}
                  <label>
                    Account code *
                    <Input
                      value={accountForm.code}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, code: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Account name *
                    <Input
                      value={accountForm.name}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Type *
                    <Select
                      value={accountForm.type}
                      onValueChange={(value) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          type: value as AccountType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountTypeOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <p className="muted">
                    Need subtypes or parent grouping? You can add those later in Chart of Accounts.
                  </p>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <DialogClose asChild>
                      <Button type="button" variant="secondary" disabled={accountSaving}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="button" onClick={handleCreateAccount} disabled={accountSaving}>
                      {accountSaving ? "Creating..." : "Create account"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button type="button" variant="secondary" disabled={!canWrite || isPosted || saving} onClick={saveDraftLines}>
              {saving ? "Saving..." : "Save draft"}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Debit</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftRows.map((row) => {
                const availableAccounts = displayAccounts.filter(
                  (account) => !selectedAccountIds.has(account.id) || account.id === row.accountId,
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Select
                        value={row.accountId || "none"}
                        onValueChange={(value) => updateDraftAccount(row.id, value === "none" ? "" : value)}
                        disabled={!canWrite || isPosted}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select account</SelectItem>
                          {availableAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} · {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.debit}
                        onChange={(event) => updateDraftAmount(row.id, "debit", event.target.value)}
                        disabled={!canWrite || isPosted}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.credit}
                        onChange={(event) => updateDraftAmount(row.id, "credit", event.target.value)}
                        disabled={!canWrite || isPosted}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeDraftRow(row.id)}
                        disabled={!canWrite || isPosted}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </FormSection>
      ) : null}

      {step === "inventory" ? (
        <FormSection
          title="Opening inventory"
          description="Enter opening quantity and unit cost for inventory items."
        >
          <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button type="button" variant="secondary" onClick={addInventoryRow} disabled={!canWrite || isPosted}>
              Add line
            </Button>
            <Button type="button" variant="secondary" disabled={!canWrite || isPosted || saving} onClick={saveInventory}>
              {saving ? "Saving..." : "Save inventory"}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit Cost</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryRows.map((row) => {
                const availableItems = displayItems.filter(
                  (item) => !selectedItemIds.has(item.id) || item.id === row.itemId,
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Select
                        value={row.itemId || "none"}
                        onValueChange={(value) => updateInventoryItem(row.id, value === "none" ? "" : value)}
                        disabled={!canWrite || isPosted}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select item</SelectItem>
                          {availableItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.sku ? `${item.sku} · ${item.name}` : item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.qty}
                        onChange={(event) => updateInventoryAmount(row.id, "qty", event.target.value)}
                        disabled={!canWrite || isPosted}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.unitCost}
                        onChange={(event) => updateInventoryAmount(row.id, "unitCost", event.target.value)}
                        disabled={!canWrite || isPosted}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeInventoryRow(row.id)}
                        disabled={!canWrite || isPosted}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </FormSection>
      ) : null}

      {step === "review" ? (
        <FormSection
          title="Review & post"
          description="Preview the journal, adjustment, and trial balance impact before posting."
        >
          {preview ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {preview.validations?.length ? (
                <div className="muted">
                  {preview.validations.map((notice, index) => (
                    <div key={`${notice.message}-${index}`}>{notice.message}</div>
                  ))}
                </div>
              ) : null}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.journalLines.map((line) => (
                    <TableRow key={`${line.accountId}-${line.code}`}>
                      <TableCell>
                        <div className="text-ui-sm">{line.code}</div>
                        <div>{line.name}</div>
                      </TableCell>
                      <TableCell>{line.debit}</TableCell>
                      <TableCell>{line.credit}</TableCell>
                      <TableCell>{line.description}</TableCell>
                    </TableRow>
                  ))}
                  {preview.adjustmentLine ? (
                    <TableRow>
                      <TableCell>
                        <div className="text-ui-sm">{preview.adjustmentLine.code}</div>
                        <div>{preview.adjustmentLine.name}</div>
                      </TableCell>
                      <TableCell>{preview.adjustmentLine.debit}</TableCell>
                      <TableCell>{preview.adjustmentLine.credit}</TableCell>
                      <TableCell>{preview.adjustmentLine.description}</TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableCell className="text-ui-sm">Totals</TableCell>
                    <TableCell>{preview.totals.debit}</TableCell>
                    <TableCell>{preview.totals.credit}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>

              <FormSection
                title="Trial balance preview"
                description="Preview of account totals after posting opening balances."
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.trialBalancePreview.rows.map((row) => (
                      <TableRow key={`${row.accountId}-tb`}>
                        <TableCell>
                          <div className="text-ui-sm">{row.code}</div>
                          <div>{row.name}</div>
                        </TableCell>
                        <TableCell>{row.debit}</TableCell>
                        <TableCell>{row.credit}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="text-ui-sm">Totals</TableCell>
                      <TableCell>{preview.trialBalancePreview.totals.debit}</TableCell>
                      <TableCell>{preview.trialBalancePreview.totals.credit}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </FormSection>

              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" disabled={!canWrite || isPosted || posting}>
                    {posting ? "Posting..." : "Post opening balances"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm posting</DialogTitle>
                  </DialogHeader>
                  <p className="muted" style={{ marginBottom: 16 }}>
                    Posting will lock the opening balance workflow and create a system journal.
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                    <DialogClose asChild>
                      <Button type="button" variant="secondary">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="button" onClick={handlePost} disabled={posting}>
                      {posting ? "Posting..." : "Confirm post"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="muted">Preview is loading...</div>
          )}
        </FormSection>
      ) : null}

      {step === "done" ? (
        <FormSection
          title="Opening balances posted"
          description="The opening balance journal has been created and the workflow is locked."
        >
          <div className="muted">Posted at: {status?.postedAt ?? "-"}</div>
        </FormSection>
      ) : null}
    </div>
  );
}
