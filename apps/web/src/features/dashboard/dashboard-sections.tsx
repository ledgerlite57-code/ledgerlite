"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Controller } from "react-hook-form";
import { type MembershipUpdateInput } from "@ledgerlite/shared";
import { Button } from "../../lib/ui-button";
import { Input } from "../../lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../lib/ui-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../lib/ui-sheet";
import { formatLabel, renderFieldError } from "./dashboard-utils";
import { formatMoney } from "../../lib/format";
import { StatusChip } from "../../lib/ui-status-chip";
import { type DashboardState } from "./use-dashboard-state";
import { useUiMode } from "../../lib/use-ui-mode";

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function DashboardOrgSetup({ dashboard }: { dashboard: DashboardState }) {
  const { isAccountant } = useUiMode();

  if (!dashboard.canCreateOrg) {
    return (
      <div className="card onboarding-card">
        <h1>Organization setup required</h1>
        <p>Contact an administrator to create your organization.</p>
      </div>
    );
  }

  return (
    <div className="card onboarding-card">
      <div className="onboarding-header">
        <p className="onboarding-eyebrow">LedgerLite Setup</p>
        <h1>Create your organization</h1>
        <p className="muted">
          Start with core accounting fields now and complete profile details anytime later.
        </p>
      </div>
      <form onSubmit={dashboard.form.handleSubmit(dashboard.submitOrg, dashboard.onOrgInvalidSubmit)}>
        <section>
          <h3>Business identity</h3>
          <p className="muted">Only organization name is required here. Add the rest when ready.</p>
          <div className="form-grid">
            <label>
              Organization Name *
              <Input {...dashboard.form.register("name")} />
              {renderFieldError(dashboard.form.formState.errors.name, "Enter an organization name.")}
            </label>
            <label>
              Legal Name
              <Input {...dashboard.form.register("legalName")} />
              {renderFieldError(dashboard.form.formState.errors.legalName)}
            </label>
            <label>
              Trade License Number
              <Input {...dashboard.form.register("tradeLicenseNumber")} />
              {renderFieldError(dashboard.form.formState.errors.tradeLicenseNumber)}
            </label>
            <label>
              Industry
              <Input {...dashboard.form.register("industryType")} />
              {renderFieldError(dashboard.form.formState.errors.industryType)}
            </label>
            <label>
              Phone
              <Input {...dashboard.form.register("phone")} />
              {renderFieldError(dashboard.form.formState.errors.phone)}
            </label>
          </div>
          <div style={{ height: 12 }} />
          <div className="form-grid">
            <label>
              Address Line 1
              <Input {...dashboard.form.register("address.line1")} />
              {renderFieldError(dashboard.form.formState.errors.address?.line1)}
            </label>
            <label>
              Address Line 2
              <Input {...dashboard.form.register("address.line2")} />
              {renderFieldError(dashboard.form.formState.errors.address?.line2)}
            </label>
            <label>
              City
              <Input {...dashboard.form.register("address.city")} />
              {renderFieldError(dashboard.form.formState.errors.address?.city)}
            </label>
            <label>
              Emirate / Region
              <Input {...dashboard.form.register("address.region")} />
              {renderFieldError(dashboard.form.formState.errors.address?.region)}
            </label>
            <label>
              Postal Code
              <Input {...dashboard.form.register("address.postalCode")} />
              {renderFieldError(dashboard.form.formState.errors.address?.postalCode)}
            </label>
            <label>
              Country
              <Input {...dashboard.form.register("address.country")} />
              {renderFieldError(dashboard.form.formState.errors.address?.country)}
            </label>
          </div>
        </section>

        <div style={{ height: 16 }} />

        <section>
          <h3>Localization</h3>
          <p className="muted">Country, base currency, fiscal start month, and time zone are required.</p>
          <div className="form-grid">
            <label>
              Default Language
              <Controller
                control={dashboard.form.control}
                name="defaultLanguage"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="en-GB">English (UK)</SelectItem>
                      <SelectItem value="ar-AE">Arabic (UAE)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {renderFieldError(dashboard.form.formState.errors.defaultLanguage)}
            </label>
            <label>
              Date Format
              <Controller
                control={dashboard.form.control}
                name="dateFormat"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select date format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {renderFieldError(dashboard.form.formState.errors.dateFormat)}
            </label>
            <label>
              Number Format
              <Controller
                control={dashboard.form.control}
                name="numberFormat"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select number format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1,234.56">1,234.56</SelectItem>
                      <SelectItem value="1.234,56">1.234,56</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {renderFieldError(dashboard.form.formState.errors.numberFormat)}
            </label>
            <label>
              Country Code *
              <Input {...dashboard.form.register("countryCode")} />
              {renderFieldError(dashboard.form.formState.errors.countryCode, "Use a 2-letter country code.")}
            </label>
            <label>
              Base Currency *
              <Input {...dashboard.form.register("baseCurrency")} />
              {renderFieldError(dashboard.form.formState.errors.baseCurrency, "Use a 3-letter currency code.")}
            </label>
            <label>
              Fiscal Year Start Month *
              <Input
                type="number"
                min={1}
                max={12}
                {...dashboard.form.register("fiscalYearStartMonth", { valueAsNumber: true })}
              />
              {renderFieldError(
                dashboard.form.formState.errors.fiscalYearStartMonth,
                "Enter a month between 1 and 12.",
              )}
            </label>
            <label>
              Time Zone *
              <Input {...dashboard.form.register("timeZone")} />
              {renderFieldError(dashboard.form.formState.errors.timeZone, "Enter a time zone.")}
            </label>
          </div>
        </section>

        <div style={{ height: 16 }} />

        <section>
          <h3>VAT</h3>
          <div className="onboarding-callout">
            UAE VAT TRN is typically 15 digits. Provide it if you are VAT registered.
          </div>
          <div className="form-grid">
            <label>
              VAT Enabled
              <input type="checkbox" {...dashboard.form.register("vatEnabled")} />
              {renderFieldError(dashboard.form.formState.errors.vatEnabled)}
            </label>
            <label>
              VAT TRN
              <Input {...dashboard.form.register("vatTrn")} />
              {renderFieldError(dashboard.form.formState.errors.vatTrn, "Enter a valid VAT TRN.")}
            </label>
          </div>
        </section>

        {isAccountant ? (
          <>
            <div style={{ height: 16 }} />
            <section>
              <h3>Accounting defaults</h3>
              <p className="muted">These can be refined later in settings.</p>
              <div className="form-grid">
                <label>
                  Default Payment Terms (days)
                  <Input
                    type="number"
                    min={0}
                    {...dashboard.form.register("defaultPaymentTerms", { valueAsNumber: true })}
                  />
                  {renderFieldError(dashboard.form.formState.errors.defaultPaymentTerms)}
                </label>
                <label>
                  VAT Behavior
                  <Controller
                    control={dashboard.form.control}
                    name="defaultVatBehavior"
                    render={({ field }) => (
                      <Select value={field.value ?? "EXCLUSIVE"} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select VAT behavior" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EXCLUSIVE">Exclusive (add VAT on top)</SelectItem>
                          <SelectItem value="INCLUSIVE">Inclusive (VAT included)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.form.formState.errors.defaultVatBehavior)}
                </label>
                <label>
                  Report Basis
                  <Controller
                    control={dashboard.form.control}
                    name="reportBasis"
                    render={({ field }) => (
                      <Select value={field.value ?? "ACCRUAL"} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select report basis" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACCRUAL">Accrual</SelectItem>
                          <SelectItem value="CASH">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.form.formState.errors.reportBasis)}
                </label>
              </div>
            </section>
          </>
        ) : null}

        <div style={{ height: 16 }} />
        <Button type="submit" disabled={dashboard.isSubmitting || dashboard.orgFormInvalid}>
          {dashboard.isSubmitting ? "Creating..." : "Create Organization"}
        </Button>
        {dashboard.orgSubmitDisabledReason ? (
          <p className="muted" style={{ marginTop: 8 }}>
            {dashboard.orgSubmitDisabledReason}
          </p>
        ) : null}
      </form>
    </div>
  );
}

export function DashboardOverviewSection({ dashboard }: { dashboard: DashboardState }) {
  const { mode, setMode } = useUiMode();
  return (
    <section>
      <h2>Get started</h2>
      <p>Use the sidebar to manage your chart of accounts and user access.</p>
      <div style={{ height: 12 }} />
      <div className="section-header">
        <div>
          <strong>Interface mode</strong>
          <p>Simple mode keeps forms concise. Accountant mode reveals advanced fields.</p>
        </div>
        <Select value={mode} onValueChange={(value) => setMode(value as "simple" | "accountant")}>
          <SelectTrigger aria-label="UI mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">Simple</SelectItem>
            <SelectItem value="accountant">Accountant</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.onboardingProgress ? (
        <>
          <div className="section-header">
            <div>
              <strong>Onboarding Checklist</strong>
              <p>
                {dashboard.onboardingProgress.track} track • {dashboard.onboardingProgress.summary.completedSteps}/
                {dashboard.onboardingProgress.summary.totalSteps} done
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => dashboard.loadOnboardingProgress()}
              disabled={dashboard.loadingOnboarding}
            >
              {dashboard.loadingOnboarding ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
          <div className="onboarding-callout">
            {dashboard.onboardingProgress.summary.completionPercent}% complete. Mark steps as you finish setup tasks.
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.onboardingProgress.steps.map((step) => (
                <TableRow key={step.id}>
                  <TableCell>
                    <strong>{step.title}</strong>
                    <div className="muted">{step.description}</div>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={step.status} />
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        type="button"
                        variant={step.status === "COMPLETED" ? "secondary" : "default"}
                        disabled={dashboard.loadingOnboarding}
                        onClick={() => dashboard.updateOnboardingStepStatus(step.stepId, "COMPLETED")}
                      >
                        Mark done
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={dashboard.loadingOnboarding}
                        onClick={() => dashboard.updateOnboardingStepStatus(step.stepId, "NOT_APPLICABLE")}
                      >
                        Not applicable
                      </Button>
                      {step.status !== "PENDING" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={dashboard.loadingOnboarding}
                          onClick={() => dashboard.updateOnboardingStepStatus(step.stepId, "PENDING")}
                        >
                          Reset
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div style={{ height: 8 }} />
          <div className="section-header">
            <div>
              <strong>Checklist completion</strong>
              <p className="muted">
                {dashboard.onboardingProgress.completedAt
                  ? `Completed on ${new Date(dashboard.onboardingProgress.completedAt).toLocaleDateString()}`
                  : `${dashboard.onboardingProgress.summary.pendingSteps} steps pending`}
              </p>
            </div>
            <Button
              type="button"
              disabled={
                dashboard.loadingOnboarding ||
                dashboard.onboardingProgress.summary.pendingSteps > 0 ||
                Boolean(dashboard.onboardingProgress.completedAt)
              }
              onClick={() => dashboard.completeOnboardingChecklist()}
            >
              Mark checklist complete
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      <div style={{ height: 12 }} />
      {dashboard.canViewAccounts ? (
        <>
          <div className="section-header">
            <div>
              <strong>Chart of Accounts</strong>
              <p>{dashboard.accounts.length} accounts configured</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=accounts">Open accounts</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewCustomers ? (
        <>
          <div className="section-header">
            <div>
              <strong>Customers</strong>
              <p>{dashboard.customers.length} active customers</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=customers">Open customers</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewVendors ? (
        <>
          <div className="section-header">
            <div>
              <strong>Vendors</strong>
              <p>{dashboard.vendors.length} active vendors</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=vendors">Open vendors</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewItems ? (
        <>
          <div className="section-header">
            <div>
              <strong>Items</strong>
              <p>{dashboard.items.length} items configured</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=items">Open items</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewTaxes && dashboard.vatEnabled ? (
        <>
          <div className="section-header">
            <div>
              <strong>Tax Codes</strong>
              <p>{dashboard.taxCodes.length} tax codes configured</p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/dashboard?tab=taxes">Open tax codes</Link>
            </Button>
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {dashboard.canViewUsers ? (
        <div className="section-header">
          <div>
            <strong>Users</strong>
            <p>{dashboard.memberships.length} team members</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard?tab=users">Open users</Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function DashboardAccountsSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewAccounts) {
    return null;
  }

  const filteredAccounts = useMemo(() => {
    const query = dashboard.accountSearch.trim().toLowerCase();
    const statusFilter = dashboard.accountStatus;
    return dashboard.accounts.filter((account) => {
      if (statusFilter !== "all") {
        const shouldBeActive = statusFilter === "active";
        if (account.isActive !== shouldBeActive) {
          return false;
        }
      }
      if (!query) {
        return true;
      }
      const tags = Array.isArray(account.tags) ? account.tags : [];
      return (
        account.code.toLowerCase().includes(query) ||
        account.name.toLowerCase().includes(query) ||
        tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [dashboard.accountSearch, dashboard.accountStatus, dashboard.accounts]);

  const treeRows = useMemo(() => {
    const accountIds = new Set(filteredAccounts.map((account) => account.id));
    const byParent = new Map<string | null, typeof filteredAccounts>();
    filteredAccounts.forEach((account) => {
      const parentKey =
        account.parentAccountId && accountIds.has(account.parentAccountId) ? account.parentAccountId : null;
      const list = byParent.get(parentKey);
      if (list) {
        list.push(account);
      } else {
        byParent.set(parentKey, [account]);
      }
    });
    byParent.forEach((list) => list.sort((a, b) => a.code.localeCompare(b.code)));

    const rows: Array<{ account: (typeof filteredAccounts)[number]; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = byParent.get(parentId) ?? [];
      children.forEach((child) => {
        rows.push({ account: child, depth });
        walk(child.id, depth + 1);
      });
    };
    walk(null, 0);
    return rows;
  }, [filteredAccounts]);

  const editingAccount = dashboard.editingAccount;
  const isProtectedAccount = Boolean(
    editingAccount?.isSystem ||
      (editingAccount?.subtype &&
        ["AR", "AP", "VAT_RECEIVABLE", "VAT_PAYABLE"].includes(editingAccount.subtype)),
  );
  const accountType = dashboard.accountForm.watch("type") ?? "ASSET";
  const parentOptions = useMemo(
    () =>
      dashboard.accounts
        .filter((account) => account.type === accountType && account.id !== editingAccount?.id)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accountType, dashboard.accounts, editingAccount?.id],
  );

  return (
    <section id="accounts">
      <div className="section-header">
        <div>
          <h2>Chart of Accounts</h2>
          <p className="muted">{filteredAccounts.length} accounts</p>
        </div>
        {dashboard.canManageAccounts ? (
          <Button onClick={() => dashboard.openAccountDialog()}>New Account</Button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input
            value={dashboard.accountSearch}
            onChange={(event) => dashboard.setAccountSearch(event.target.value)}
            placeholder="Search code, name, or tag"
          />
        </label>
        <label>
          Status
          <Select value={dashboard.accountStatus} onValueChange={dashboard.setAccountStatus}>
            <SelectTrigger aria-label="Account status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div style={{ height: 12 }} />
      {filteredAccounts.length === 0 ? <p>No accounts match your search.</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            {dashboard.canManageAccounts ? <TableHead>Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {treeRows.map(({ account, depth }) => (
            <TableRow key={account.id}>
              <TableCell>{account.code}</TableCell>
              <TableCell>
                <div style={{ paddingLeft: depth * 16 }}>
                  {account.name}
                  {account.isSystem ? <span className="muted" style={{ marginLeft: 8 }}>System</span> : null}
                </div>
              </TableCell>
              <TableCell>{account.subtype ? formatLabel(account.subtype) : formatLabel(account.type)}</TableCell>
              <TableCell>{account.isActive ? "Active" : "Inactive"}</TableCell>
              {dashboard.canManageAccounts ? (
                <TableCell>
                  <Button variant="secondary" onClick={() => dashboard.openAccountDialog(account)}>
                    Edit
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {dashboard.canManageAccounts ? (
        <Dialog
          open={dashboard.accountDialogOpen}
          onOpenChange={(open) => {
            dashboard.setAccountDialogOpen(open);
            if (!open) {
              dashboard.setEditingAccount(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount ? "Edit account" : "Create account"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={dashboard.accountForm.handleSubmit(dashboard.submitAccount)}>
              <div className="form-grid">
                <label>
                  Code *
                  <Input {...dashboard.accountForm.register("code")} />
                  {renderFieldError(dashboard.accountForm.formState.errors.code, "Enter an account code.")}
                </label>
                <label>
                  Name *
                  <Input {...dashboard.accountForm.register("name")} />
                  {renderFieldError(dashboard.accountForm.formState.errors.name, "Enter an account name.")}
                </label>
                <label>
                  Type *
                  <Controller
                    control={dashboard.accountForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={isProtectedAccount}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ASSET">Asset</SelectItem>
                          <SelectItem value="LIABILITY">Liability</SelectItem>
                          <SelectItem value="EQUITY">Equity</SelectItem>
                          <SelectItem value="INCOME">Income</SelectItem>
                          <SelectItem value="EXPENSE">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.accountForm.formState.errors.type, "Select an account type.")}
                </label>
                <label>
                  Subtype
                  <Controller
                    control={dashboard.accountForm.control}
                    name="subtype"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                        disabled={isProtectedAccount}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select subtype" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {dashboard.filteredSubtypeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {formatLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.accountForm.formState.errors.subtype, "Select a subtype.")}
                </label>
                <label>
                  Parent Account
                  <Controller
                    control={dashboard.accountForm.control}
                    name="parentAccountId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {parentOptions.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} · {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.accountForm.formState.errors.parentAccountId)}
                </label>
              </div>
              <div style={{ height: 12 }} />
              <details className="card">
                <summary className="cursor-pointer text-sm font-semibold">Advanced</summary>
                <div style={{ height: 12 }} />
                <div className="form-grid">
                  <label>
                    Description
                    <textarea className="input" rows={3} {...dashboard.accountForm.register("description")} />
                    {renderFieldError(dashboard.accountForm.formState.errors.description)}
                  </label>
                  <label>
                    Normal Balance
                    <Controller
                      control={dashboard.accountForm.control}
                      name="normalBalance"
                      render={({ field }) => (
                        <Select value={field.value ?? "DEBIT"} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select balance" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DEBIT">Debit</SelectItem>
                            <SelectItem value="CREDIT">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </label>
                  <label>
                    Reconcilable
                    <input type="checkbox" {...dashboard.accountForm.register("isReconcilable")} />
                    {renderFieldError(dashboard.accountForm.formState.errors.isReconcilable)}
                  </label>
                  {dashboard.vatEnabled ? (
                    <label>
                      Default Tax Code
                      <Controller
                        control={dashboard.accountForm.control}
                        name="taxCodeId"
                        render={({ field }) => (
                          <Select
                            value={field.value ? field.value : "none"}
                            onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                          >
                            <SelectTrigger aria-label="Default tax code">
                              <SelectValue placeholder="Select tax code" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {dashboard.activeTaxCodes.map((code) => (
                                <SelectItem key={code.id} value={code.id}>
                                  {code.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {renderFieldError(dashboard.accountForm.formState.errors.taxCodeId)}
                    </label>
                  ) : null}
                  <label>
                    External Code
                    <Input {...dashboard.accountForm.register("externalCode")} />
                    {renderFieldError(dashboard.accountForm.formState.errors.externalCode)}
                  </label>
                  <label>
                    Tags
                    <Controller
                      control={dashboard.accountForm.control}
                      name="tags"
                      render={({ field }) => (
                        <Input
                          value={Array.isArray(field.value) ? field.value.join(", ") : ""}
                          onChange={(event) => {
                            const next = event.target.value
                              .split(",")
                              .map((tag) => tag.trim())
                              .filter(Boolean);
                            field.onChange(next);
                          }}
                          placeholder="Comma-separated tags"
                        />
                      )}
                    />
                    {renderFieldError(dashboard.accountForm.formState.errors.tags)}
                  </label>
                  <label>
                    Status
                    <Controller
                      control={dashboard.accountForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <Select
                          value={field.value === false ? "inactive" : "active"}
                          onValueChange={(value) => field.onChange(value === "active")}
                          disabled={isProtectedAccount}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.accountForm.formState.errors.isActive)}
                    <p className="muted">
                      Disabling accounts used in transactions is blocked to protect the ledger.
                    </p>
                  </label>
                </div>
                {isProtectedAccount ? (
                  <>
                    <div style={{ height: 8 }} />
                    <p className="muted">
                      System, AR/AP, and VAT accounts cannot be deactivated or retyped.
                    </p>
                  </>
                ) : null}
              </details>
              <div style={{ height: 12 }} />
              <Button type="submit">{editingAccount ? "Save Account" : "Create Account"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

export function DashboardCustomersSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewCustomers) {
    return null;
  }

  return (
    <section id="customers">
      <div className="section-header">
        <h2>Customers</h2>
        {dashboard.canManageCustomers ? (
          <Button onClick={() => dashboard.openCustomerSheet()}>New Customer</Button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input value={dashboard.customerSearch} onChange={(event) => dashboard.setCustomerSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={dashboard.customerStatus} onValueChange={dashboard.setCustomerStatus}>
            <SelectTrigger aria-label="Customer status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.loadingCustomers ? <p>Loading customers...</p> : null}
      {!dashboard.loadingCustomers && dashboard.customers.length === 0 ? <p>No customers yet. Add your first customer.</p> : null}
      {dashboard.customers.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Status</TableHead>
              {dashboard.canManageCustomers ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>{customer.name}</TableCell>
                <TableCell>{customer.email ?? "-"}</TableCell>
                <TableCell>{customer.phone ?? "-"}</TableCell>
                <TableCell>{customer.paymentTermsDays} days</TableCell>
                <TableCell>
                  {dashboard.canManageCustomers ? (
                    <Select
                      value={customer.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateCustomerStatus(customer.id, value === "active")}
                    >
                      <SelectTrigger aria-label="Customer status toggle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : customer.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
                {dashboard.canManageCustomers ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => dashboard.openCustomerSheet(customer)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {dashboard.canManageCustomers ? (
        <Sheet
          open={dashboard.customerSheetOpen}
          onOpenChange={(open) => {
            dashboard.setCustomerSheetOpen(open);
            if (!open) {
              dashboard.setEditingCustomer(null);
            }
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{dashboard.editingCustomer ? "Edit customer" : "Create customer"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={dashboard.customerForm.handleSubmit(dashboard.submitCustomer)}>
              <div className="form-grid">
                <label>
                  Name *
                  <Input {...dashboard.customerForm.register("name")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.name, "Enter a customer name.")}
                </label>
                <label>
                  Email
                  <Input {...dashboard.customerForm.register("email")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.email, "Enter a valid email.")}
                </label>
                <label>
                  Phone
                  <Input {...dashboard.customerForm.register("phone")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.phone, "Enter a valid phone.")}
                </label>
                <label>
                  Billing Address
                  <Input {...dashboard.customerForm.register("billingAddress")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.billingAddress)}
                </label>
                <label>
                  Shipping Address
                  <Input {...dashboard.customerForm.register("shippingAddress")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.shippingAddress)}
                </label>
                <label>
                  TRN
                  <Input {...dashboard.customerForm.register("trn")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.trn)}
                </label>
                <label>
                  Payment Terms (days) *
                  <Input type="number" min={0} {...dashboard.customerForm.register("paymentTermsDays")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.paymentTermsDays, "Enter payment terms.")}
                </label>
                <label>
                  Credit Limit
                  <Input type="number" min={0} step="0.01" {...dashboard.customerForm.register("creditLimit")} />
                  {renderFieldError(dashboard.customerForm.formState.errors.creditLimit, "Enter a valid credit limit.")}
                </label>
              </div>
              <div style={{ height: 12 }} />
              <Button type="submit">
                {dashboard.editingCustomer ? "Save Customer" : "Create Customer"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

export function DashboardVendorsSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewVendors) {
    return null;
  }

  return (
    <section id="vendors">
      <div className="section-header">
        <h2>Vendors</h2>
        {dashboard.canManageVendors ? (
          <Button onClick={() => dashboard.openVendorSheet()}>New Vendor</Button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input value={dashboard.vendorSearch} onChange={(event) => dashboard.setVendorSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={dashboard.vendorStatus} onValueChange={dashboard.setVendorStatus}>
            <SelectTrigger aria-label="Vendor status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.loadingVendors ? <p>Loading vendors...</p> : null}
      {!dashboard.loadingVendors && dashboard.vendors.length === 0 ? <p>No vendors yet. Add your first vendor.</p> : null}
      {dashboard.vendors.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Status</TableHead>
              {dashboard.canManageVendors ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell>{vendor.name}</TableCell>
                <TableCell>{vendor.email ?? "-"}</TableCell>
                <TableCell>{vendor.phone ?? "-"}</TableCell>
                <TableCell>{vendor.paymentTermsDays} days</TableCell>
                <TableCell>
                  {dashboard.canManageVendors ? (
                    <Select
                      value={vendor.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateVendorStatus(vendor.id, value === "active")}
                    >
                      <SelectTrigger aria-label="Vendor status toggle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : vendor.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
                {dashboard.canManageVendors ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => dashboard.openVendorSheet(vendor)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {dashboard.canManageVendors ? (
        <Sheet
          open={dashboard.vendorSheetOpen}
          onOpenChange={(open) => {
            dashboard.setVendorSheetOpen(open);
            if (!open) {
              dashboard.setEditingVendor(null);
            }
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{dashboard.editingVendor ? "Edit vendor" : "Create vendor"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={dashboard.vendorForm.handleSubmit(dashboard.submitVendor)}>
              <div className="form-grid">
                <label>
                  Name *
                  <Input {...dashboard.vendorForm.register("name")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.name, "Enter a vendor name.")}
                </label>
                <label>
                  Email
                  <Input {...dashboard.vendorForm.register("email")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.email, "Enter a valid email.")}
                </label>
                <label>
                  Phone
                  <Input {...dashboard.vendorForm.register("phone")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.phone, "Enter a valid phone.")}
                </label>
                <label>
                  Address
                  <Input {...dashboard.vendorForm.register("address")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.address)}
                </label>
                <label>
                  TRN
                  <Input {...dashboard.vendorForm.register("trn")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.trn)}
                </label>
                <label>
                  Payment Terms (days) *
                  <Input type="number" min={0} {...dashboard.vendorForm.register("paymentTermsDays")} />
                  {renderFieldError(dashboard.vendorForm.formState.errors.paymentTermsDays, "Enter payment terms.")}
                </label>
              </div>
              <div style={{ height: 12 }} />
              <Button type="submit">
                {dashboard.editingVendor ? "Save Vendor" : "Create Vendor"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

export function DashboardItemsSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewItems) {
    return null;
  }

  const itemCategory = dashboard.itemForm.watch("type") ?? "SERVICE";
  const isInventory = itemCategory === "INVENTORY";
  const isService = itemCategory === "SERVICE";
  const isFixedAsset = itemCategory === "FIXED_ASSET";
  const isNonInventory = itemCategory === "NON_INVENTORY_EXPENSE";
  const trackInventory = isInventory;
  const selectedUnitId = dashboard.itemForm.watch("unitOfMeasureId");
  const openingQtyRaw = dashboard.itemForm.watch("openingQty");
  const openingValueRaw = dashboard.itemForm.watch("openingValue");
  const purchasePriceRaw = dashboard.itemForm.watch("purchasePrice");
  const activeUnits = dashboard.unitsOfMeasure.filter((unit) => unit.isActive);
  const selectedUnit = activeUnits.find((unit) => unit.id === selectedUnitId);
  const unitSuffix = selectedUnit ? ` (${selectedUnit.symbol})` : "";
  const assetAccounts = dashboard.accounts.filter((account) => account.type === "ASSET" && account.isActive);
  const baseCurrency = dashboard.org?.baseCurrency ?? "AED";

  useEffect(() => {
    dashboard.itemForm.setValue("trackInventory", isInventory);
  }, [dashboard.itemForm, isInventory]);

  useEffect(() => {
    if (!trackInventory) {
      return;
    }

    const openingQty = parseOptionalNumber(openingQtyRaw);
    if (openingQty === undefined || openingQty <= 0) {
      return;
    }

    const openingValue = parseOptionalNumber(openingValueRaw);
    const purchasePrice = parseOptionalNumber(purchasePriceRaw);

    if (openingValue === undefined && purchasePrice !== undefined) {
      dashboard.itemForm.setValue("openingValue", Number((openingQty * purchasePrice).toFixed(2)), {
        shouldDirty: true,
        shouldValidate: true,
      });
      return;
    }

    if (purchasePrice === undefined && openingValue !== undefined) {
      dashboard.itemForm.setValue("purchasePrice", Number((openingValue / openingQty).toFixed(2)), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [dashboard.itemForm, openingQtyRaw, openingValueRaw, purchasePriceRaw, trackInventory]);

  const categoryHelp =
    itemCategory === "INVENTORY"
      ? "Stocked goods. Requires income, COGS, and inventory asset accounts. Inventory tracking is enabled."
      : itemCategory === "FIXED_ASSET"
        ? "Capitalized assets. Requires a fixed asset account. Not allowed on sales invoices by default."
        : itemCategory === "NON_INVENTORY_EXPENSE"
          ? "Non-stock expenses. Requires an expense account. No inventory tracking."
          : "Services require an income account. Expense account is optional for internal cost tracking.";

  return (
    <section id="items">
      <div className="section-header">
        <h2>Items</h2>
        {dashboard.canManageItems ? <Button onClick={() => dashboard.openItemSheet()}>New Item</Button> : null}
      </div>
      <div className="form-grid">
        <label>
          Search
          <Input value={dashboard.itemSearch} onChange={(event) => dashboard.setItemSearch(event.target.value)} />
        </label>
        <label>
          Status
          <Select value={dashboard.itemStatus} onValueChange={dashboard.setItemStatus}>
            <SelectTrigger aria-label="Item status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div style={{ height: 12 }} />
      {dashboard.loadingItems ? <p>Loading items...</p> : null}
      {!dashboard.loadingItems && dashboard.items.length === 0 ? (
        <p>No items yet. Add your first service, inventory item, fixed asset, or expense.</p>
      ) : null}
      {dashboard.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Sale Price</TableHead>
              <TableHead>Income Account</TableHead>
              <TableHead>Expense/COGS Account</TableHead>
              <TableHead>Asset Account</TableHead>
              <TableHead>Status</TableHead>
              {dashboard.canManageItems ? <TableHead>Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.sku ?? "-"}</TableCell>
                <TableCell>{formatLabel(item.type)}</TableCell>
                <TableCell>{formatMoney(item.salePrice, baseCurrency)}</TableCell>
                <TableCell>
                  {item.type === "SERVICE" || item.type === "INVENTORY" ? item.incomeAccount?.name ?? "-" : "-"}
                </TableCell>
                <TableCell>
                  {item.type === "INVENTORY" || item.type === "NON_INVENTORY_EXPENSE" || item.type === "SERVICE"
                    ? item.expenseAccount?.name ?? "-"
                    : "-"}
                </TableCell>
                <TableCell>
                  {item.type === "INVENTORY"
                    ? item.inventoryAccount?.name ?? "-"
                    : item.type === "FIXED_ASSET"
                      ? item.fixedAssetAccount?.name ?? "-"
                      : "-"}
                </TableCell>
                <TableCell>
                  {dashboard.canManageItems ? (
                    <Select
                      value={item.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateItemStatus(item.id, value === "active")}
                    >
                      <SelectTrigger aria-label="Item status toggle">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : item.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
                {dashboard.canManageItems ? (
                  <TableCell>
                    <Button variant="secondary" onClick={() => dashboard.openItemSheet(item)}>
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {dashboard.canManageItems ? (
        <Sheet
          open={dashboard.itemSheetOpen}
          onOpenChange={(open) => {
            dashboard.setItemSheetOpen(open);
            if (!open) {
              dashboard.setEditingItem(null);
            }
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{dashboard.editingItem ? "Edit item" : "Create item"}</SheetTitle>
            </SheetHeader>
            <form onSubmit={dashboard.itemForm.handleSubmit(dashboard.submitItem)}>
              <div className="form-grid">
                <label>
                  Name *
                  <Input {...dashboard.itemForm.register("name")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.name, "Enter an item name.")}
                </label>
                <label>
                  Category *
                  <Controller
                    control={dashboard.itemForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Item type">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {dashboard.itemTypeOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {formatLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="muted">{categoryHelp}</p>
                  {renderFieldError(dashboard.itemForm.formState.errors.type, "Select an item type.")}
                </label>
                <label>
                  SKU
                  <Input {...dashboard.itemForm.register("sku")} />
                  <p className="muted">Leave blank to auto-generate (example: ITM-000123).</p>
                  {renderFieldError(dashboard.itemForm.formState.errors.sku)}
                </label>
                <label>
                  Unit of Measure
                  <Controller
                    control={dashboard.itemForm.control}
                    name="unitOfMeasureId"
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Unit of measure">
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeUnits.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name} ({unit.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {renderFieldError(dashboard.itemForm.formState.errors.unitOfMeasureId)}
                </label>
                <label>
                  Sale Price *
                  <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("salePrice")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.salePrice, "Enter a valid sale price.")}
                </label>
                <label>
                  Purchase Price
                  <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("purchasePrice")} />
                  {renderFieldError(dashboard.itemForm.formState.errors.purchasePrice, "Enter a valid purchase price.")}
                </label>
                {isService || isInventory ? (
                  <label>
                    Income Account *
                    <Controller
                      control={dashboard.itemForm.control}
                      name="incomeAccountId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Income account">
                            <SelectValue placeholder="Select income account" />
                          </SelectTrigger>
                          <SelectContent>
                            {dashboard.incomeAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.itemForm.formState.errors.incomeAccountId, "Select an income account.")}
                  </label>
                ) : null}
                {isService || isInventory || isNonInventory ? (
                  <label>
                    {isInventory ? "COGS Account *" : isService ? "Expense Account (optional)" : "Expense Account *"}
                    <Controller
                      control={dashboard.itemForm.control}
                      name="expenseAccountId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Expense account">
                            <SelectValue placeholder="Select expense account" />
                          </SelectTrigger>
                          <SelectContent>
                            {dashboard.expenseAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.itemForm.formState.errors.expenseAccountId, "Select an expense account.")}
                  </label>
                ) : null}
                {isInventory ? (
                  <label>
                    Inventory Asset Account *
                    <Controller
                      control={dashboard.itemForm.control}
                      name="inventoryAccountId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Inventory asset account">
                            <SelectValue placeholder="Select inventory account" />
                          </SelectTrigger>
                          <SelectContent>
                            {assetAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(
                      dashboard.itemForm.formState.errors.inventoryAccountId,
                      "Select an inventory asset account.",
                    )}
                  </label>
                ) : null}
                {isFixedAsset ? (
                  <label>
                    Fixed Asset Account *
                    <Controller
                      control={dashboard.itemForm.control}
                      name="fixedAssetAccountId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Fixed asset account">
                            <SelectValue placeholder="Select fixed asset account" />
                          </SelectTrigger>
                          <SelectContent>
                            {assetAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(
                      dashboard.itemForm.formState.errors.fixedAssetAccountId,
                      "Select a fixed asset account.",
                    )}
                  </label>
                ) : null}
                {dashboard.vatEnabled ? (
                  <label>
                    Default Tax Code
                    <Controller
                      control={dashboard.itemForm.control}
                      name="defaultTaxCodeId"
                      render={({ field }) => (
                        <Select
                          value={field.value ? field.value : "none"}
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                        >
                          <SelectTrigger aria-label="Default tax code">
                            <SelectValue placeholder="Select tax code" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {dashboard.activeTaxCodes.map((code) => (
                              <SelectItem key={code.id} value={code.id}>
                                {code.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.itemForm.formState.errors.defaultTaxCodeId, "Select a tax code.")}
                  </label>
                ) : null}
                {isInventory ? (
                  <label>
                    Track Inventory
                    <input type="checkbox" disabled {...dashboard.itemForm.register("trackInventory")} />
                    <p className="muted">Inventory tracking is required for stocked items.</p>
                    {renderFieldError(dashboard.itemForm.formState.errors.trackInventory)}
                  </label>
                ) : null}
                {trackInventory ? (
                  <>
                    <label>
                      Reorder Point{unitSuffix}
                      <Input type="number" min={0} {...dashboard.itemForm.register("reorderPoint")} />
                      {renderFieldError(dashboard.itemForm.formState.errors.reorderPoint, "Enter a reorder point.")}
                    </label>
                    <label>
                      Opening Quantity{unitSuffix}
                      <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("openingQty")} />
                      {renderFieldError(dashboard.itemForm.formState.errors.openingQty, "Enter opening quantity.")}
                    </label>
                    <label>
                      Opening Value
                      <Input type="number" min={0} step="0.01" {...dashboard.itemForm.register("openingValue")} />
                      <p className="muted">Auto-calculates from opening quantity and purchase price when left blank.</p>
                      {renderFieldError(dashboard.itemForm.formState.errors.openingValue, "Enter opening value.")}
                    </label>
                  </>
                ) : null}
              </div>
              <div style={{ height: 12 }} />
              <Button type="submit">
                {dashboard.editingItem ? "Save Item" : "Create Item"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

export function DashboardTaxCodesSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewTaxes) {
    return null;
  }

  return (
    <section id="taxes">
      <div className="section-header">
        <h2>Tax Codes</h2>
        {dashboard.canManageTaxes ? (
          <Button onClick={() => dashboard.openTaxSheet()} disabled={!dashboard.vatEnabled}>
            New Tax Code
          </Button>
        ) : null}
      </div>
      {!dashboard.vatEnabled ? <p>VAT is disabled for this organization.</p> : null}
      {dashboard.vatEnabled ? (
        <>
          <div className="form-grid">
            <label>
              Search
              <Input value={dashboard.taxSearch} onChange={(event) => dashboard.setTaxSearch(event.target.value)} />
            </label>
            <label>
              Status
              <Select value={dashboard.taxStatus} onValueChange={dashboard.setTaxStatus}>
                <SelectTrigger aria-label="Tax status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <div style={{ alignSelf: "end" }}>
              <Button variant="secondary" onClick={() => dashboard.loadTaxCodes()}>
                Apply Filters
              </Button>
            </div>
          </div>
          <div style={{ height: 12 }} />
          {dashboard.loadingTaxCodes ? <p>Loading tax codes...</p> : null}
          {!dashboard.loadingTaxCodes && dashboard.taxCodes.length === 0 ? <p>No tax codes yet. Add your first tax rate.</p> : null}
          {dashboard.taxCodes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  {dashboard.canManageTaxes ? <TableHead>Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.taxCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>{code.name}</TableCell>
                    <TableCell>{Number(code.rate)}%</TableCell>
                    <TableCell>{formatLabel(code.type)}</TableCell>
                    <TableCell>
                      {dashboard.canManageTaxes ? (
                        <Select
                          value={code.isActive ? "active" : "inactive"}
                          onValueChange={(value) => dashboard.updateTaxStatus(code.id, value === "active")}
                        >
                          <SelectTrigger aria-label="Tax status toggle">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : code.isActive ? (
                        "Active"
                      ) : (
                        "Inactive"
                      )}
                    </TableCell>
                    {dashboard.canManageTaxes ? (
                      <TableCell>
                        <Button variant="secondary" onClick={() => dashboard.openTaxSheet(code)}>
                          Edit
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {dashboard.canManageTaxes ? (
            <Sheet
              open={dashboard.taxSheetOpen}
              onOpenChange={(open) => {
                dashboard.setTaxSheetOpen(open);
                if (!open) {
                  dashboard.setEditingTaxCode(null);
                }
              }}
            >
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{dashboard.editingTaxCode ? "Edit tax code" : "Create tax code"}</SheetTitle>
                </SheetHeader>
                <form onSubmit={dashboard.taxForm.handleSubmit(dashboard.submitTaxCode)}>
                  <div className="form-grid">
                    <label>
                      Name *
                      <Input {...dashboard.taxForm.register("name")} />
                      {renderFieldError(dashboard.taxForm.formState.errors.name, "Enter a tax code name.")}
                    </label>
                    <label>
                      Rate (%) *
                      <Input type="number" min={0} max={100} step="0.01" {...dashboard.taxForm.register("rate")} />
                      {renderFieldError(dashboard.taxForm.formState.errors.rate, "Enter a valid tax rate.")}
                    </label>
                    <label>
                      Type *
                      <Controller
                        control={dashboard.taxForm.control}
                        name="type"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger aria-label="Tax type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {dashboard.taxTypeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {formatLabel(option)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {renderFieldError(dashboard.taxForm.formState.errors.type, "Select a tax type.")}
                    </label>
                  </div>
                  <div style={{ height: 12 }} />
                  <Button type="submit">
                    {dashboard.editingTaxCode ? "Save Tax Code" : "Create Tax Code"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function DashboardUsersSection({ dashboard }: { dashboard: DashboardState }) {
  if (!dashboard.canViewUsers) {
    return null;
  }

  const formatDateCell = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "-";
    }
    return parsed.toLocaleDateString("en-GB");
  };

  return (
    <section id="users">
      <div className="section-header">
        <h2>Users</h2>
        {dashboard.canInviteUsers ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button>Invite User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite user</DialogTitle>
              </DialogHeader>
              <form onSubmit={dashboard.inviteForm.handleSubmit(dashboard.submitInvite)}>
                <div className="form-grid">
                  <label>
                    Email *
                    <Input {...dashboard.inviteForm.register("email")} />
                    {renderFieldError(dashboard.inviteForm.formState.errors.email, "Enter a valid email.")}
                  </label>
                  <label>
                    Role *
                    <Controller
                      control={dashboard.inviteForm.control}
                      name="roleId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {dashboard.roles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(dashboard.inviteForm.formState.errors.roleId, "Select a role.")}
                  </label>
                </div>
                <div style={{ height: 12 }} />
                <Button type="submit">
                  Send Invite
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      {dashboard.canInviteUsers ? (
        <p className="muted">
          Invites show real-time lifecycle state. Resend issues a fresh link and refreshes expiry.
        </p>
      ) : null}
      {!dashboard.canManageUsers ? <p className="muted">You do not have permission to manage users.</p> : null}
      {dashboard.canManageUsers ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.memberships.map((membership) => (
              <TableRow key={membership.id}>
                <TableCell>{membership.user.email}</TableCell>
                <TableCell>
                  {dashboard.canManageUsers ? (
                    <Select
                      value={membership.role.id}
                      onValueChange={(value) => dashboard.updateMembership(membership.id, { roleId: value } as MembershipUpdateInput)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dashboard.roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    membership.role.name
                  )}
                </TableCell>
                <TableCell>
                  {dashboard.canManageUsers ? (
                    <Select
                      value={membership.isActive ? "active" : "inactive"}
                      onValueChange={(value) => dashboard.updateMembership(membership.id, { isActive: value === "active" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : membership.isActive ? (
                    "Active"
                  ) : (
                    "Inactive"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {dashboard.canInviteUsers ? (
        <>
          <div style={{ height: 16 }} />
          <h3>Invites</h3>
          {dashboard.invites.length === 0 ? (
            <p className="muted">No invites yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Last Sent</TableHead>
                  <TableHead>Sends</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.invites.map((invite) => {
                  const canResend = invite.status === "SENT" || invite.status === "EXPIRED";
                  const canRevoke = invite.status === "SENT" || invite.status === "EXPIRED";
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>{invite.roleName}</TableCell>
                      <TableCell>
                        <StatusChip status={invite.status} />
                      </TableCell>
                      <TableCell>{formatDateCell(invite.expiresAt)}</TableCell>
                      <TableCell>{formatDateCell(invite.lastSentAt)}</TableCell>
                      <TableCell>{invite.sendCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!canResend}
                            onClick={() => dashboard.resendInvite(invite.id)}
                          >
                            Resend
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={!canRevoke}
                            onClick={() => dashboard.revokeInvite(invite.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}
    </section>
  );
}
