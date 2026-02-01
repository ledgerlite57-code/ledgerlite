"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "../../../../src/lib/zod-resolver";
import {
  Permissions,
  orgSettingsUpdateSchema,
  orgUpdateSchema,
  type OrgSettingsUpdateInput,
  type OrgUpdateInput,
} from "@ledgerlite/shared";
import { apiFetch } from "../../../../src/lib/api";
import { Button } from "../../../../src/lib/ui-button";
import { Input } from "../../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../src/lib/ui-select";
import { usePermissions } from "../../../../src/features/auth/use-permissions";
import { useUiMode } from "../../../../src/lib/use-ui-mode";

type AddressRecord = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type LanguageCode = "en-US" | "en-GB" | "ar-AE";
type DateFormatCode = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
type NumberFormatCode = "1,234.56" | "1.234,56";

type OrgSettingsRecord = {
  invoicePrefix?: string | null;
  invoiceNextNumber?: number | null;
  billPrefix?: string | null;
  billNextNumber?: number | null;
  expensePrefix?: string | null;
  expenseNextNumber?: number | null;
  paymentPrefix?: string | null;
  paymentNextNumber?: number | null;
  vendorPaymentPrefix?: string | null;
  vendorPaymentNextNumber?: number | null;
  defaultPaymentTerms?: number | null;
  defaultVatBehavior?: "EXCLUSIVE" | "INCLUSIVE" | null;
  defaultArAccountId?: string | null;
  defaultApAccountId?: string | null;
  reportBasis?: "ACCRUAL" | "CASH" | null;
  lockDate?: string | null;
};

type OrgRecord = {
  id: string;
  name: string;
  legalName?: string | null;
  tradeLicenseNumber?: string | null;
  address?: AddressRecord | null;
  phone?: string | null;
  industryType?: string | null;
  defaultLanguage?: LanguageCode | null;
  dateFormat?: DateFormatCode | null;
  numberFormat?: NumberFormatCode | null;
  countryCode?: string | null;
  baseCurrency?: string | null;
  fiscalYearStartMonth?: number | null;
  vatEnabled?: boolean | null;
  vatTrn?: string | null;
  timeZone?: string | null;
  orgSettings?: OrgSettingsRecord | null;
};

type AccountRecord = {
  id: string;
  code: string;
  name: string;
  subtype?: string | null;
  isActive: boolean;
};

const languageOptions: LanguageCode[] = ["en-US", "en-GB", "ar-AE"];
const dateFormatOptions: DateFormatCode[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
const numberFormatOptions: NumberFormatCode[] = ["1,234.56", "1.234,56"];

const normalizeLanguage = (value?: string | null): LanguageCode =>
  languageOptions.includes(value as LanguageCode) ? (value as LanguageCode) : "en-US";

const normalizeDateFormat = (value?: string | null): DateFormatCode =>
  dateFormatOptions.includes(value as DateFormatCode) ? (value as DateFormatCode) : "DD/MM/YYYY";

const normalizeNumberFormat = (value?: string | null): NumberFormatCode =>
  numberFormatOptions.includes(value as NumberFormatCode) ? (value as NumberFormatCode) : "1,234.56";

const formatDateInput = (value?: Date | null) => {
  if (!value) {
    return "";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

export default function OrganizationSettingsPage() {
  const { hasPermission } = usePermissions();
  const { isAccountant } = useUiMode();
  const canRead = hasPermission(Permissions.ORG_READ);
  const canWrite = hasPermission(Permissions.ORG_WRITE);
  const canViewAccounts = hasPermission(Permissions.COA_READ);

  const [org, setOrg] = useState<OrgRecord | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const orgForm = useForm<OrgUpdateInput>({
    resolver: zodResolver(orgUpdateSchema),
    defaultValues: {
      name: "",
      legalName: "",
      tradeLicenseNumber: "",
      address: {
        line1: "",
        line2: "",
        city: "",
        region: "",
        postalCode: "",
        country: "",
      },
      phone: "",
      industryType: "",
      defaultLanguage: "en-US",
      dateFormat: "DD/MM/YYYY",
      numberFormat: "1,234.56",
      countryCode: "AE",
      baseCurrency: "AED",
      fiscalYearStartMonth: 1,
      vatEnabled: false,
      vatTrn: "",
      timeZone: "Asia/Dubai",
    },
  });

  const settingsForm = useForm<OrgSettingsUpdateInput>({
    resolver: zodResolver(orgSettingsUpdateSchema),
    defaultValues: {
      invoicePrefix: "INV-",
      invoiceNextNumber: 1,
      billPrefix: "BILL-",
      billNextNumber: 1,
      expensePrefix: "EXP-",
      expenseNextNumber: 1,
      paymentPrefix: "PAY-",
      paymentNextNumber: 1,
      vendorPaymentPrefix: "VPAY-",
      vendorPaymentNextNumber: 1,
      defaultPaymentTerms: 30,
      defaultVatBehavior: "EXCLUSIVE",
      reportBasis: "ACCRUAL",
      lockDate: null,
    },
  });
  const vatEnabled = orgForm.watch("vatEnabled");

  const loadData = useCallback(async () => {
    if (!canRead) {
      return;
    }
    setLoading(true);
    try {
      setActionError(null);
      const data = await apiFetch<OrgRecord>("/orgs/current");
      setOrg(data ?? null);
      if (canViewAccounts) {
        const accountData = await apiFetch<AccountRecord[]>("/accounts");
        setAccounts(accountData ?? []);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load organization settings.");
    } finally {
      setLoading(false);
    }
  }, [canRead, canViewAccounts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!org) {
      return;
    }
    const address = org.address ?? {};
    orgForm.reset({
      name: org.name ?? "",
      legalName: org.legalName ?? "",
      tradeLicenseNumber: org.tradeLicenseNumber ?? "",
      address: {
        line1: address.line1 ?? "",
        line2: address.line2 ?? "",
        city: address.city ?? "",
        region: address.region ?? "",
        postalCode: address.postalCode ?? "",
        country: address.country ?? org.countryCode ?? "",
      },
      phone: org.phone ?? "",
      industryType: org.industryType ?? "",
      defaultLanguage: normalizeLanguage(org.defaultLanguage),
      dateFormat: normalizeDateFormat(org.dateFormat),
      numberFormat: normalizeNumberFormat(org.numberFormat),
      countryCode: org.countryCode ?? "AE",
      baseCurrency: org.baseCurrency ?? "AED",
      fiscalYearStartMonth: org.fiscalYearStartMonth ?? 1,
      vatEnabled: org.vatEnabled ?? false,
      vatTrn: org.vatTrn ?? "",
      timeZone: org.timeZone ?? "Asia/Dubai",
    });

    const settings = org.orgSettings ?? {};
    settingsForm.reset({
      invoicePrefix: settings.invoicePrefix ?? "INV-",
      invoiceNextNumber: settings.invoiceNextNumber ?? 1,
      billPrefix: settings.billPrefix ?? "BILL-",
      billNextNumber: settings.billNextNumber ?? 1,
      expensePrefix: settings.expensePrefix ?? "EXP-",
      expenseNextNumber: settings.expenseNextNumber ?? 1,
      paymentPrefix: settings.paymentPrefix ?? "PAY-",
      paymentNextNumber: settings.paymentNextNumber ?? 1,
      vendorPaymentPrefix: settings.vendorPaymentPrefix ?? "VPAY-",
      vendorPaymentNextNumber: settings.vendorPaymentNextNumber ?? 1,
      defaultPaymentTerms: settings.defaultPaymentTerms ?? 30,
      defaultVatBehavior: settings.defaultVatBehavior ?? "EXCLUSIVE",
      defaultArAccountId: settings.defaultArAccountId ?? undefined,
      defaultApAccountId: settings.defaultApAccountId ?? undefined,
      reportBasis: settings.reportBasis ?? "ACCRUAL",
      lockDate: settings.lockDate ? new Date(settings.lockDate) : null,
    });
  }, [org, orgForm, settingsForm]);

  const arAccounts = useMemo(
    () => accounts.filter((account) => account.subtype === "AR" && account.isActive),
    [accounts],
  );
  const apAccounts = useMemo(
    () => accounts.filter((account) => account.subtype === "AP" && account.isActive),
    [accounts],
  );

  const handleOrgSubmit = async (values: OrgUpdateInput) => {
    if (!canWrite) {
      setActionError("You do not have permission to update organization settings.");
      return;
    }
    setSavingOrg(true);
    try {
      setActionError(null);
      await apiFetch("/orgs/current", { method: "PATCH", body: JSON.stringify(values) });
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save organization details.");
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSettingsSubmit = async (values: OrgSettingsUpdateInput) => {
    if (!canWrite) {
      setActionError("You do not have permission to update organization settings.");
      return;
    }
    setSavingSettings(true);
    try {
      setActionError(null);
      await apiFetch("/orgs/settings", { method: "PATCH", body: JSON.stringify(values) });
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save organization settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  if (!canRead) {
    return (
      <div className="card">
        <h1>Organization Settings</h1>
        <p className="muted">You do not have permission to view organization settings.</p>
      </div>
    );
  }

  if (!org && !loading) {
    return (
      <div className="card">
        <h1>Organization Settings</h1>
        <p className="muted">No organization found yet.</p>
        <Button asChild variant="secondary">
          <Link href="/dashboard">Create organization</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Organization Settings</h1>
          <p className="muted">Manage business identity and accounting preferences.</p>
        </div>
      </div>

      {actionError ? <p className="form-error">{actionError}</p> : null}
      {loading ? <p className="muted">Loading organization settings...</p> : null}

      <div style={{ height: 12 }} />

      <form onSubmit={orgForm.handleSubmit(handleOrgSubmit)}>
        <section>
          <h3>Business identity</h3>
          <div className="form-grid">
            <label>
              Organization Name *
              <Input {...orgForm.register("name")} />
              {renderFieldError(orgForm.formState.errors.name?.message)}
            </label>
            <label>
              Legal Name *
              <Input {...orgForm.register("legalName")} />
              {renderFieldError(orgForm.formState.errors.legalName?.message)}
            </label>
            <label>
              Trade License Number *
              <Input {...orgForm.register("tradeLicenseNumber")} />
              {renderFieldError(orgForm.formState.errors.tradeLicenseNumber?.message)}
            </label>
            <label>
              Industry
              <Input {...orgForm.register("industryType")} />
              {renderFieldError(orgForm.formState.errors.industryType?.message)}
            </label>
            <label>
              Phone
              <Input {...orgForm.register("phone")} />
              {renderFieldError(orgForm.formState.errors.phone?.message)}
            </label>
          </div>
          <div style={{ height: 12 }} />
          <div className="form-grid">
            <label>
              Address Line 1 *
              <Input {...orgForm.register("address.line1")} />
              {renderFieldError(orgForm.formState.errors.address?.line1?.message)}
            </label>
            <label>
              Address Line 2
              <Input {...orgForm.register("address.line2")} />
            </label>
            <label>
              City *
              <Input {...orgForm.register("address.city")} />
              {renderFieldError(orgForm.formState.errors.address?.city?.message)}
            </label>
            <label>
              Emirate / Region
              <Input {...orgForm.register("address.region")} />
            </label>
            <label>
              Postal Code
              <Input {...orgForm.register("address.postalCode")} />
            </label>
            <label>
              Country
              <Input {...orgForm.register("address.country")} />
            </label>
          </div>
        </section>

        <div style={{ height: 16 }} />

        <section>
          <h3>Localization</h3>
          <div className="form-grid">
            <label>
              Default Language
              <Controller
                control={orgForm.control}
                name="defaultLanguage"
                render={({ field }) => (
                  <Select value={field.value ?? "en-US"} onValueChange={field.onChange}>
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
              {renderFieldError(orgForm.formState.errors.defaultLanguage?.message)}
            </label>
            <label>
              Date Format
              <Controller
                control={orgForm.control}
                name="dateFormat"
                render={({ field }) => (
                  <Select value={field.value ?? "DD/MM/YYYY"} onValueChange={field.onChange}>
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
              {renderFieldError(orgForm.formState.errors.dateFormat?.message)}
            </label>
            <label>
              Number Format
              <Controller
                control={orgForm.control}
                name="numberFormat"
                render={({ field }) => (
                  <Select value={field.value ?? "1,234.56"} onValueChange={field.onChange}>
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
              {renderFieldError(orgForm.formState.errors.numberFormat?.message)}
            </label>
            <label>
              Country Code
              <Input {...orgForm.register("countryCode")} />
              {renderFieldError(orgForm.formState.errors.countryCode?.message)}
            </label>
            <label>
              Base Currency
              <Input {...orgForm.register("baseCurrency")} />
              {renderFieldError(orgForm.formState.errors.baseCurrency?.message)}
            </label>
            <label>
              Fiscal Year Start Month
              <Input type="number" min={1} max={12} {...orgForm.register("fiscalYearStartMonth", { valueAsNumber: true })} />
              {renderFieldError(orgForm.formState.errors.fiscalYearStartMonth?.message)}
            </label>
            <label>
              Time Zone
              <Input {...orgForm.register("timeZone")} />
              {renderFieldError(orgForm.formState.errors.timeZone?.message)}
            </label>
          </div>
        </section>

        <div style={{ height: 16 }} />

        <section>
          <h3>VAT</h3>
          <p className="muted">UAE VAT TRN is typically 15 digits. Required if VAT is enabled.</p>
          <div className="form-grid">
            <label>
              VAT Enabled
              <input type="checkbox" {...orgForm.register("vatEnabled")} />
            </label>
            <label>
              VAT TRN
              <Input disabled={!vatEnabled} {...orgForm.register("vatTrn")} />
              {renderFieldError(orgForm.formState.errors.vatTrn?.message)}
              {!vatEnabled ? <p className="muted">Enable VAT to edit the TRN.</p> : null}
            </label>
          </div>
        </section>

        <div style={{ height: 12 }} />
        <Button type="submit" disabled={!canWrite || savingOrg}>
          {savingOrg ? "Saving..." : "Save organization"}
        </Button>
      </form>

      <div style={{ height: 24 }} />

      <form onSubmit={settingsForm.handleSubmit(handleSettingsSubmit)}>
        <section>
          <h3>Accounting preferences</h3>
          <div className="form-grid">
            <label>
              Default Payment Terms (days)
              <Input
                type="number"
                min={0}
                {...settingsForm.register("defaultPaymentTerms", { valueAsNumber: true })}
              />
            </label>
            <label>
              VAT Behavior
              <Controller
                control={settingsForm.control}
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
            </label>
            <label>
              Report Basis
              <Controller
                control={settingsForm.control}
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
            </label>
          </div>
        </section>

        {isAccountant ? (
          <>
            <div style={{ height: 16 }} />
            <section>
              <h3>Default accounts</h3>
              <div className="form-grid">
                <label>
                  Accounts Receivable
                  <Controller
                    control={settingsForm.control}
                    name="defaultArAccountId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select AR account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {arAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </label>
                <label>
                  Accounts Payable
                  <Controller
                    control={settingsForm.control}
                    name="defaultApAccountId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select AP account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {apAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </label>
              </div>
            </section>

            <div style={{ height: 16 }} />
            <section>
              <h3>Numbering formats</h3>
              <div className="form-grid">
                <label>
                  Invoice Prefix
                  <Input {...settingsForm.register("invoicePrefix")} />
                </label>
                <label>
                  Invoice Next Number
                  <Input type="number" min={1} {...settingsForm.register("invoiceNextNumber", { valueAsNumber: true })} />
                </label>
                <label>
                  Bill Prefix
                  <Input {...settingsForm.register("billPrefix")} />
                </label>
                <label>
                  Bill Next Number
                  <Input type="number" min={1} {...settingsForm.register("billNextNumber", { valueAsNumber: true })} />
                </label>
                <label>
                  Expense Prefix
                  <Input {...settingsForm.register("expensePrefix")} />
                </label>
                <label>
                  Expense Next Number
                  <Input
                    type="number"
                    min={1}
                    {...settingsForm.register("expenseNextNumber", { valueAsNumber: true })}
                  />
                </label>
                <label>
                  Payment Prefix
                  <Input {...settingsForm.register("paymentPrefix")} />
                </label>
                <label>
                  Payment Next Number
                  <Input type="number" min={1} {...settingsForm.register("paymentNextNumber", { valueAsNumber: true })} />
                </label>
                <label>
                  Vendor Payment Prefix
                  <Input {...settingsForm.register("vendorPaymentPrefix")} />
                </label>
                <label>
                  Vendor Payment Next Number
                  <Input type="number" min={1} {...settingsForm.register("vendorPaymentNextNumber", { valueAsNumber: true })} />
                </label>
              </div>
            </section>

            <div style={{ height: 16 }} />
            <section>
              <h3>Lock date</h3>
              <p className="muted">Prevents changes to documents dated on or before the lock date.</p>
              <div className="form-grid">
                <label>
                  Lock Date
                  <Controller
                    control={settingsForm.control}
                    name="lockDate"
                    render={({ field }) => (
                      <Input
                        type="date"
                        value={formatDateInput(field.value as Date | null)}
                        onChange={(event) =>
                          field.onChange(event.target.value ? new Date(event.target.value) : null)
                        }
                      />
                    )}
                  />
                </label>
              </div>
            </section>
          </>
        ) : null}

        <div style={{ height: 12 }} />
        <Button type="submit" disabled={!canWrite || savingSettings}>
          {savingSettings ? "Saving..." : "Save accounting settings"}
        </Button>
      </form>
    </div>
  );
}
