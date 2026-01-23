"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  bankTransactionImportSchema,
  Permissions,
  type BankTransactionImportInput,
  type BankTransactionImportLineInput,
} from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { normalizeError } from "../../../../src/lib/errors";
import { toast } from "../../../../src/lib/use-toast";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../src/lib/ui-table";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { ErrorBanner } from "../../../../src/lib/ui-error-banner";

type BankAccountRecord = {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
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
const showErrorToast = (title: string, error: unknown) => {
  const normalized = normalizeError(error);
  toast({
    variant: "destructive",
    title,
    description: normalized.hint ? `${normalized.message} ${normalized.hint}` : normalized.message,
  });
};

export default function BankTransactionsImportPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const { hasPermission } = usePermissions();
  const canImport = hasPermission(Permissions.BANK_WRITE);

  const form = useForm<BankTransactionImportInput>({
    resolver: zodResolver(bankTransactionImportSchema),
    defaultValues: {
      bankAccountId: "",
      transactions: [
        {
          txnDate: new Date(),
          description: "",
          amount: 0,
          externalRef: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "transactions",
  });

  const selectedBankAccountId = form.watch("bankAccountId");
  const selectedBankAccount = useMemo(
    () => bankAccounts.find((account) => account.id === selectedBankAccountId),
    [bankAccounts, selectedBankAccountId],
  );

  useEffect(() => {
    const loadBankAccounts = async () => {
      setLoading(true);
      try {
        const data = await apiFetch<BankAccountRecord[]>("/bank-accounts");
        setBankAccounts(data);
      } catch (err) {
        setActionError(err);
        showErrorToast("Unable to load bank accounts", err);
      } finally {
        setLoading(false);
      }
    };

    loadBankAccounts();
  }, []);

  const submitImport = async (values: BankTransactionImportInput) => {
    if (!canImport) {
      return;
    }
    setSaving(true);
    try {
      setActionError(null);
      const currency = selectedBankAccount?.currency;
      const payload = {
        bankAccountId: values.bankAccountId,
        transactions: values.transactions.map((transaction) => ({
          ...transaction,
          currency: currency ?? transaction.currency,
          externalRef: transaction.externalRef?.trim() ? transaction.externalRef.trim() : undefined,
        })) as BankTransactionImportLineInput[],
      };

      const result = await apiFetch<{ imported: number; skipped: number }>("/bank-transactions/import", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload),
      });

      toast({
        title: "Transactions imported",
        description: `Imported ${result.imported} transactions. Skipped ${result.skipped}.`,
      });
    } catch (err) {
      setActionError(err);
      showErrorToast("Unable to import transactions", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card">Loading bank accounts...</div>;
  }

  if (!canImport) {
    return (
      <div className="card">
        <h1>Import Bank Transactions</h1>
        <p className="muted">You do not have permission to import transactions.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Import Bank Transactions</h1>
          <p className="muted">Add statement lines to prepare for reconciliation.</p>
        </div>
      </div>

      {actionError ? <ErrorBanner error={actionError} onRetry={() => window.location.reload()} /> : null}

      <form onSubmit={form.handleSubmit(submitImport)}>
        <div className="form-grid">
          <label>
            Bank Account *
            <Controller
              control={form.control}
              name="bankAccountId"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Bank account">
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {renderFieldError(form.formState.errors.bankAccountId?.message)}
          </label>
        </div>

        <div style={{ height: 16 }} />
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
            {fields.map((field, index) => (
              <TableRow key={field.id}>
                <TableCell>
                  <Controller
                    control={form.control}
                    name={`transactions.${index}.txnDate`}
                    render={({ field }) => (
                      <Input
                        type="date"
                        value={formatDateInput(field.value as Date)}
                        onChange={(event) => field.onChange(new Date(`${event.target.value}T00:00:00`))}
                      />
                    )}
                  />
                  {renderFieldError(form.formState.errors.transactions?.[index]?.txnDate?.message)}
                </TableCell>
                <TableCell>
                  <Input {...form.register(`transactions.${index}.description`)} />
                  {renderFieldError(form.formState.errors.transactions?.[index]?.description?.message)}
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" {...form.register(`transactions.${index}.amount`, { valueAsNumber: true })} />
                  {renderFieldError(form.formState.errors.transactions?.[index]?.amount?.message)}
                </TableCell>
                <TableCell>
                  <Input {...form.register(`transactions.${index}.externalRef`)} />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" onClick={() => remove(index)} disabled={fields.length <= 1}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            append({
              txnDate: new Date(),
              description: "",
              amount: 0,
              externalRef: "",
            })
          }
        >
          Add Line
        </Button>

        <div style={{ height: 16 }} />
        <Button type="submit" disabled={saving || !selectedBankAccount}>
          {saving ? "Importing..." : "Import Transactions"}
        </Button>
      </form>
    </div>
  );
}
