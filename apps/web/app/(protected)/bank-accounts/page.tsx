"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../src/lib/zod-resolver";
import {
  bankAccountCreateSchema,
  currencyOptions,
  Permissions,
  type BankAccountCreateInput,
  type PaginatedResponse,
} from "@ledgerlite/shared";
import { Landmark } from "lucide-react";
import { apiFetch } from "../../../src/lib/api";
import { formatDate, formatMoney } from "../../../src/lib/format";
import { Button } from "../../../src/lib/ui-button";
import { FormSection } from "../../../src/lib/ui-form-section";
import { Input } from "../../../src/lib/ui-input";
import { PageHeader } from "../../../src/lib/ui-page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../../src/lib/ui-sheet";
import { StatusChip } from "../../../src/lib/ui-status-chip";
import { usePermissions } from "../../../src/features/auth/use-permissions";

type BankAccountRecord = {
  id: string;
  name: string;
  currency: string;
  accountNumberMasked?: string | null;
  openingBalance: string | number;
  openingBalanceDate?: string | null;
  isActive: boolean;
  glAccount?: { id: string; code: string; name: string };
};

type AccountRecord = {
  id: string;
  code: string;
  name: string;
  subtype?: string | null;
  isActive: boolean;
};

const formatDateInput = (value?: Date | string | null) => {
  if (!value) {
    return "";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function BankAccountsPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [orgCurrency, setOrgCurrency] = useState("AED");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccountRecord | null>(null);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(Permissions.BANK_WRITE);

  const form = useForm<BankAccountCreateInput>({
    resolver: zodResolver(bankAccountCreateSchema),
    defaultValues: {
      name: "",
      glAccountId: "",
      currency: orgCurrency,
      accountNumberMasked: "",
      openingBalance: 0,
      openingBalanceDate: undefined,
      isActive: true,
    },
  });

  const activeGlAccounts = useMemo(
    () => accounts.filter((account) => account.isActive && account.subtype === "BANK"),
    [accounts],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      setActionError(null);
      const [org, bankResult, accountData] = await Promise.all([
        apiFetch<{ baseCurrency?: string }>("/orgs/current"),
        apiFetch<BankAccountRecord[] | PaginatedResponse<BankAccountRecord>>("/bank-accounts?includeInactive=true"),
        apiFetch<AccountRecord[]>("/accounts"),
      ]);
      const bankData = Array.isArray(bankResult) ? bankResult : bankResult.data ?? [];
      setOrgCurrency(org.baseCurrency ?? "AED");
      setBankAccounts(bankData);
      setAccounts(accountData);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load bank accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openSheet = (account?: BankAccountRecord) => {
    setEditing(account ?? null);
    const defaults = account
      ? {
          name: account.name,
          glAccountId: account.glAccount?.id ?? "",
          currency: account.currency,
          accountNumberMasked: account.accountNumberMasked ?? "",
          openingBalance: Number(account.openingBalance ?? 0),
          openingBalanceDate: account.openingBalanceDate ? new Date(account.openingBalanceDate) : undefined,
          isActive: account.isActive,
        }
      : {
          name: "",
          glAccountId: "",
          currency: orgCurrency,
          accountNumberMasked: "",
          openingBalance: 0,
          openingBalanceDate: undefined,
          isActive: true,
        };
    form.reset(defaults);
    setSheetOpen(true);
  };

  const resetSheet = () => {
    setEditing(null);
    form.reset({
      name: "",
      glAccountId: "",
      currency: orgCurrency,
      accountNumberMasked: "",
      openingBalance: 0,
      openingBalanceDate: undefined,
      isActive: true,
    });
  };

  const submitBankAccount = async (values: BankAccountCreateInput) => {
    setSaving(true);
    try {
      setActionError(null);
      const payload = {
        ...values,
        currency: values.currency ?? orgCurrency,
        accountNumberMasked: values.accountNumberMasked ?? undefined,
      };

      if (editing) {
        await apiFetch(`/bank-accounts/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/bank-accounts", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(payload),
        });
      }

      setSheetOpen(false);
      setEditing(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save bank account.");
    } finally {
      setSaving(false);
    }
  };

  const detailErrors =
    Boolean(form.formState.errors.name) ||
    Boolean(form.formState.errors.glAccountId) ||
    Boolean(form.formState.errors.currency) ||
    Boolean(form.formState.errors.accountNumberMasked);
  const openingErrors = Boolean(form.formState.errors.openingBalance) || Boolean(form.formState.errors.openingBalanceDate);

  return (
    <div className="card">
      <PageHeader
        title="Bank Accounts"
        description="Manage bank accounts used for cash posting and reconciliation."
        icon={<Landmark className="h-5 w-5" />}
        actions={
          canWrite ? (
            <Sheet
              open={sheetOpen}
              onOpenChange={(open) => {
                setSheetOpen(open);
                if (!open) {
                  resetSheet();
                }
              }}
            >
              <SheetTrigger asChild>
                <Button onClick={() => openSheet()}>New Bank Account</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{editing ? "Edit bank account" : "Create bank account"}</SheetTitle>
                </SheetHeader>
                <form onSubmit={form.handleSubmit(submitBankAccount)}>
                  <FormSection title="Account details" description="Pick the linked GL account and currency." hasError={detailErrors}>
                    <div className="form-grid">
                      <label>
                        Name *
                        <Input {...form.register("name")} />
                        {renderFieldError(form.formState.errors.name?.message)}
                      </label>
                      <label>
                        GL Account (Bank) *
                        <Controller
                          control={form.control}
                          name="glAccountId"
                          render={({ field }) => (
                            <Select value={field.value ?? ""} onValueChange={field.onChange}>
                              <SelectTrigger aria-label="GL account">
                                <SelectValue placeholder="Select bank account" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeGlAccounts.map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.code} - {account.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {renderFieldError(form.formState.errors.glAccountId?.message)}
                      </label>
                      <label>
                        Currency *
                        <Controller
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <Select value={field.value ?? orgCurrency} onValueChange={field.onChange}>
                              <SelectTrigger aria-label="Currency">
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                              <SelectContent>
                                {currencyOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {renderFieldError(form.formState.errors.currency?.message)}
                        <p className="muted">Defaults to your org base currency.</p>
                      </label>
                      <label>
                        Account Number (Masked)
                        <Input {...form.register("accountNumberMasked")} />
                      </label>
                    </div>
                  </FormSection>
                  <FormSection
                    title="Opening balance"
                    description="Optional. Use the balance as of the opening date."
                    collapsible
                    defaultOpen={false}
                    hasError={openingErrors}
                  >
                    <div className="form-grid">
                      <label>
                        Opening Balance
                        <Input type="number" step="0.01" {...form.register("openingBalance", { valueAsNumber: true })} />
                        {renderFieldError(form.formState.errors.openingBalance?.message)}
                      </label>
                      <label>
                        Opening Balance Date
                        <Controller
                          control={form.control}
                          name="openingBalanceDate"
                          render={({ field }) => (
                            <Input
                              type="date"
                              value={formatDateInput(field.value)}
                              onChange={(event) =>
                                field.onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)
                              }
                            />
                          )}
                        />
                        {renderFieldError(form.formState.errors.openingBalanceDate?.message)}
                        <p className="muted">We post an opening entry on the selected date.</p>
                      </label>
                    </div>
                  </FormSection>
                  <FormSection title="Status">
                    <div className="form-grid">
                      <label>
                        Status
                        <Controller
                          control={form.control}
                          name="isActive"
                          render={({ field }) => (
                            <Select value={field.value ? "true" : "false"} onValueChange={(value) => field.onChange(value === "true")}>
                              <SelectTrigger aria-label="Account status">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Active</SelectItem>
                                <SelectItem value="false">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </label>
                    </div>
                  </FormSection>
                  <div style={{ height: 12 }} />
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : editing ? "Save Changes" : "Create Account"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          ) : null
        }
      />

      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p>Loading bank accounts...</p> : null}
      {!loading && bankAccounts.length === 0 ? <p>No bank accounts yet.</p> : null}

      {bankAccounts.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>GL Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opening Balance</TableHead>
              <TableHead>Opening Date</TableHead>
              {canWrite ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>{account.name}</TableCell>
                <TableCell>{account.currency}</TableCell>
                <TableCell>
                  {account.glAccount ? `${account.glAccount.code} - ${account.glAccount.name}` : "-"}
                </TableCell>
                <TableCell>
                  <StatusChip status={account.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>{formatMoney(account.openingBalance ?? 0, account.currency)}</TableCell>
                <TableCell>{account.openingBalanceDate ? formatDate(account.openingBalanceDate) : "-"}</TableCell>
                {canWrite ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => openSheet(account)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
