"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  accountCreateSchema,
  accountSubtypeSchema,
  customerCreateSchema,
  inviteCreateSchema,
  itemCreateSchema,
  itemTypeSchema,
  membershipUpdateSchema,
  orgCreateSchema,
  taxCodeCreateSchema,
  taxTypeSchema,
  vendorCreateSchema,
  type AccountCreateInput,
  type CustomerCreateInput,
  type InviteCreateInput,
  type ItemCreateInput,
  type MembershipUpdateInput,
  type OrgCreateInput,
  type TaxCodeCreateInput,
  type VendorCreateInput,
} from "@ledgerlite/shared";
import { apiBaseUrl, apiFetch } from "../../../src/lib/api";
import { clearAccessToken, getAccessToken, setAccessToken } from "../../../src/lib/auth";
import { Button } from "../../../src/lib/ui-button";
import { Input } from "../../../src/lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../src/lib/ui-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../src/lib/ui-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../src/lib/ui-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../../src/lib/ui-sheet";

type AddressPayload = { formatted?: string } | null;
type OrgSummary = { id: string; name?: string; vatEnabled?: boolean };
type CustomerRecord = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  trn?: string | null;
  paymentTermsDays: number;
  creditLimit?: string | number | null;
  billingAddress?: AddressPayload;
  shippingAddress?: AddressPayload;
  isActive: boolean;
};
type VendorRecord = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  trn?: string | null;
  paymentTermsDays: number;
  address?: AddressPayload;
  isActive: boolean;
};
type TaxCodeRecord = {
  id: string;
  name: string;
  rate: string | number;
  type: string;
  isActive: boolean;
};
type AccountLite = {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
  isActive?: boolean;
};
type ItemRecord = {
  id: string;
  name: string;
  type: string;
  sku?: string | null;
  salePrice: string | number;
  purchasePrice?: string | number | null;
  incomeAccount: AccountLite;
  expenseAccount: AccountLite;
  defaultTaxCode?: { id: string; name: string } | null;
  isActive: boolean;
};

type FieldErrorLike = { message?: string };

const renderFieldError = (error?: FieldErrorLike, fallback?: string) =>
  error ? <p className="form-error">{fallback ?? error.message ?? "This field is required."}</p> : null;

function DashboardPageInner() {
  const [status, setStatus] = useState("Checking access...");
  const [orgMissing, setOrgMissing] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [mounted, setMounted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<
    { id: string; code: string; name: string; type: string; subtype?: string | null; isSystem: boolean; isActive: boolean }[]
  >([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRecord[]>([]);
  const [memberships, setMemberships] = useState<
    { id: string; isActive: boolean; user: { email: string }; role: { id: string; name: string } }[]
  >([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingTaxCodes, setLoadingTaxCodes] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerStatus, setCustomerStatus] = useState("active");
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorStatus, setVendorStatus] = useState("active");
  const [itemSearch, setItemSearch] = useState("");
  const [itemStatus, setItemStatus] = useState("active");
  const [taxSearch, setTaxSearch] = useState("");
  const [taxStatus, setTaxStatus] = useState("active");
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [vendorSheetOpen, setVendorSheetOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorRecord | null>(null);
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [taxSheetOpen, setTaxSheetOpen] = useState(false);
  const [editingTaxCode, setEditingTaxCode] = useState<TaxCodeRecord | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "overview";
  const showAccounts = tab === "accounts";
  const showCustomers = tab === "customers";
  const showVendors = tab === "vendors";
  const showItems = tab === "items";
  const showTaxes = tab === "taxes";
  const showUsers = tab === "users";
  const showOverview = !showAccounts && !showUsers && !showCustomers && !showVendors && !showItems && !showTaxes;
  const form = useForm<OrgCreateInput>({
    resolver: zodResolver(orgCreateSchema),
    defaultValues: {
      name: "",
      countryCode: "AE",
      baseCurrency: "AED",
      fiscalYearStartMonth: 1,
      vatEnabled: false,
      vatTrn: "",
      timeZone: "Asia/Dubai",
    },
  });
  const isSubmitting = useMemo(() => form.formState.isSubmitting, [form.formState.isSubmitting]);
  const accountForm = useForm<AccountCreateInput>({
    resolver: zodResolver(accountCreateSchema),
    defaultValues: {
      code: "",
      name: "",
      type: "ASSET",
    },
  });
  const accountSubtypeOptions = accountSubtypeSchema.options;
  const accountSubtypeByType = useMemo(() => {
    return {
      ASSET: ["BANK", "CASH", "AR", "VAT_RECEIVABLE", "VENDOR_PREPAYMENTS"],
      LIABILITY: ["AP", "VAT_PAYABLE", "CUSTOMER_ADVANCES"],
      EQUITY: ["EQUITY"],
      INCOME: ["SALES"],
      EXPENSE: ["EXPENSE"],
    } as const;
  }, []);
  const formatLabel = (value: string) =>
    value
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  const itemTypeOptions = itemTypeSchema.options;
  const taxTypeOptions = taxTypeSchema.options;
  const vatEnabled = org?.vatEnabled ?? false;
  const selectedAccountType = accountForm.watch("type");
  const filteredSubtypeOptions = useMemo(() => {
    const filtered = accountSubtypeByType[selectedAccountType] ?? [];
    return accountSubtypeOptions.filter((option) => filtered.includes(option));
  }, [accountSubtypeByType, accountSubtypeOptions, selectedAccountType]);
  const incomeAccounts = useMemo(
    () => accounts.filter((account) => account.type === "INCOME" && account.isActive),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((account) => account.type === "EXPENSE" && account.isActive),
    [accounts],
  );
  const activeTaxCodes = useMemo(() => taxCodes.filter((code) => code.isActive), [taxCodes]);
  const inviteForm = useForm<InviteCreateInput>({
    resolver: zodResolver(inviteCreateSchema),
    defaultValues: {
      email: "",
      roleId: "",
    },
  });
  const customerForm = useForm<CustomerCreateInput>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      billingAddress: "",
      shippingAddress: "",
      trn: "",
      paymentTermsDays: 0,
      creditLimit: undefined,
    },
  });
  const vendorForm = useForm<VendorCreateInput>({
    resolver: zodResolver(vendorCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      trn: "",
      paymentTermsDays: 0,
    },
  });
  const itemForm = useForm<ItemCreateInput>({
    resolver: zodResolver(itemCreateSchema),
    defaultValues: {
      name: "",
      type: "SERVICE",
      sku: "",
      salePrice: 0,
      purchasePrice: undefined,
      incomeAccountId: "",
      expenseAccountId: "",
      defaultTaxCodeId: "",
    },
  });
  const taxForm = useForm<TaxCodeCreateInput>({
    resolver: zodResolver(taxCodeCreateSchema),
    defaultValues: {
      name: "",
      rate: 0,
      type: "STANDARD",
    },
  });

  useEffect(() => {
    setMounted(true);

    const ensureAccessToken = async () => {
      const existing = getAccessToken();
      if (existing) {
        return existing;
      }

      const refresh = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!refresh.ok) {
        return null;
      }
      const payload = (await refresh.json()) as { ok?: boolean; data?: { accessToken?: string } };
      if (payload?.data?.accessToken) {
        setAccessToken(payload.data.accessToken);
        return payload.data.accessToken;
      }
      return null;
    };

    ensureAccessToken()
      .then(async (token) => {
        if (!token) {
          clearAccessToken();
          setStatus("Session expired. Redirecting to login...");
          router.replace("/login");
          return;
        }
        const orgRes = await fetch(`${apiBaseUrl}/orgs/current`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (orgRes.ok) {
          const payload = (await orgRes.json()) as { ok?: boolean; data?: OrgSummary };
          setOrg(payload?.data ?? null);
          setOrgName(payload?.data?.name ?? null);
          setStatus("Organization ready.");
          setOrgMissing(false);
          setActionError(null);
          setLoadingData(true);
          try {
            const [accountData, userData, roleData] = await Promise.all([
              apiFetch<typeof accounts>("/accounts"),
              apiFetch<typeof memberships>("/orgs/users"),
              apiFetch<typeof roles>("/orgs/roles"),
            ]);
            setAccounts(accountData);
            setMemberships(userData);
            setRoles(roleData);
          } catch (err) {
            setActionError(err instanceof Error ? err.message : "Unable to load organization data.");
          } finally {
            setLoadingData(false);
          }
          return;
        }
        if (orgRes.status === 404) {
          setStatus("Organization setup required.");
          setOrgMissing(true);
          setOrg(null);
          setOrgName(null);
          return;
        }
        if (orgRes.status === 401) {
          clearAccessToken();
          router.replace("/login");
          return;
        }
        setStatus("Access denied.");
      })
      .catch(() => {
        setStatus("Failed to reach API.");
      });
  }, [router]);

  const submitOrg = async (values: OrgCreateInput) => {
    try {
      setActionError(null);
      const result = await apiFetch<{ org: OrgSummary; accessToken: string }>("/orgs", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(values),
      });
      setAccessToken(result.accessToken);
      setOrgMissing(false);
      setStatus("Organization ready.");
      setOrg(result.org);
      setOrgName(result.org?.name ?? values.name);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to create organization.");
    }
  };

  const submitAccount = async (values: AccountCreateInput) => {
    try {
      setActionError(null);
      const result = await apiFetch<typeof accounts[number]>("/accounts", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setAccounts((prev) => [...prev, result].sort((a, b) => a.code.localeCompare(b.code)));
      accountForm.reset();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to add account.");
    }
  };

  const submitInvite = async (values: InviteCreateInput) => {
    try {
      setActionError(null);
      await apiFetch<{ token: string }>("/orgs/users/invite", {
        method: "POST",
        body: JSON.stringify(values),
      });
      inviteForm.reset();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to send invite.");
    }
  };

  const updateMembership = async (membershipId: string, values: MembershipUpdateInput) => {
    try {
      setActionError(null);
      const updated = await apiFetch<typeof memberships[number]>(`/orgs/users/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setMemberships((prev) => prev.map((item) => (item.id === membershipId ? updated : item)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update membership.");
    }
  };

  const buildQuery = (search: string, status: string) => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (status !== "all") {
      params.set("isActive", status === "active" ? "true" : "false");
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const loadCustomers = async (search = customerSearch, status = customerStatus) => {
    setLoadingCustomers(true);
    try {
      setActionError(null);
      const data = await apiFetch<CustomerRecord[]>(`/customers${buildQuery(search, status)}`);
      setCustomers(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load customers.");
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadVendors = async (search = vendorSearch, status = vendorStatus) => {
    setLoadingVendors(true);
    try {
      setActionError(null);
      const data = await apiFetch<VendorRecord[]>(`/vendors${buildQuery(search, status)}`);
      setVendors(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load vendors.");
    } finally {
      setLoadingVendors(false);
    }
  };

  const loadItems = async (search = itemSearch, status = itemStatus) => {
    setLoadingItems(true);
    try {
      setActionError(null);
      const data = await apiFetch<ItemRecord[]>(`/items${buildQuery(search, status)}`);
      setItems(data);
      if (vatEnabled && taxCodes.length === 0) {
        const taxData = await apiFetch<TaxCodeRecord[]>("/tax-codes");
        setTaxCodes(taxData);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load items.");
    } finally {
      setLoadingItems(false);
    }
  };

  const loadTaxCodes = async (search = taxSearch, status = taxStatus) => {
    if (!vatEnabled) {
      return;
    }
    setLoadingTaxCodes(true);
    try {
      setActionError(null);
      const data = await apiFetch<TaxCodeRecord[]>(`/tax-codes${buildQuery(search, status)}`);
      setTaxCodes(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to load tax codes.");
    } finally {
      setLoadingTaxCodes(false);
    }
  };

  useEffect(() => {
    if (!mounted || orgMissing || !org) {
      return;
    }
    if (showCustomers) {
      loadCustomers();
    }
    if (showVendors) {
      loadVendors();
    }
    if (showItems) {
      loadItems();
    }
    if (showTaxes) {
      loadTaxCodes();
    }
  }, [showCustomers, showVendors, showItems, showTaxes, orgMissing, org, mounted]);

  if (!mounted) {
    return null;
  }

  const openCustomerSheet = (customer?: CustomerRecord) => {
    setEditingCustomer(customer ?? null);
    customerForm.reset({
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      billingAddress: customer?.billingAddress?.formatted ?? "",
      shippingAddress: customer?.shippingAddress?.formatted ?? "",
      trn: customer?.trn ?? "",
      paymentTermsDays: customer?.paymentTermsDays ?? 0,
      creditLimit:
        customer?.creditLimit !== null && customer?.creditLimit !== undefined
          ? Number(customer.creditLimit)
          : undefined,
      isActive: customer?.isActive ?? true,
    });
    setCustomerSheetOpen(true);
  };

  const openVendorSheet = (vendor?: VendorRecord) => {
    setEditingVendor(vendor ?? null);
    vendorForm.reset({
      name: vendor?.name ?? "",
      email: vendor?.email ?? "",
      phone: vendor?.phone ?? "",
      address: vendor?.address?.formatted ?? "",
      trn: vendor?.trn ?? "",
      paymentTermsDays: vendor?.paymentTermsDays ?? 0,
      isActive: vendor?.isActive ?? true,
    });
    setVendorSheetOpen(true);
  };

  const openItemSheet = (item?: ItemRecord) => {
    setEditingItem(item ?? null);
    itemForm.reset({
      name: item?.name ?? "",
      type: (item?.type as ItemCreateInput["type"]) ?? "SERVICE",
      sku: item?.sku ?? "",
      salePrice: item?.salePrice !== null && item?.salePrice !== undefined ? Number(item.salePrice) : 0,
      purchasePrice:
        item?.purchasePrice !== null && item?.purchasePrice !== undefined ? Number(item.purchasePrice) : undefined,
      incomeAccountId: item?.incomeAccount?.id ?? "",
      expenseAccountId: item?.expenseAccount?.id ?? "",
      defaultTaxCodeId: item?.defaultTaxCode?.id ?? "",
      isActive: item?.isActive ?? true,
    });
    if (vatEnabled && taxCodes.length === 0) {
      loadTaxCodes();
    }
    setItemSheetOpen(true);
  };

  const openTaxSheet = (taxCode?: TaxCodeRecord) => {
    setEditingTaxCode(taxCode ?? null);
    taxForm.reset({
      name: taxCode?.name ?? "",
      rate: taxCode?.rate !== null && taxCode?.rate !== undefined ? Number(taxCode.rate) : 0,
      type: (taxCode?.type as TaxCodeCreateInput["type"]) ?? "STANDARD",
      isActive: taxCode?.isActive ?? true,
    });
    setTaxSheetOpen(true);
  };

  const submitCustomer = async (values: CustomerCreateInput) => {
    try {
      setActionError(null);
      if (editingCustomer) {
        await apiFetch<CustomerRecord>(`/customers/${editingCustomer.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      } else {
        await apiFetch<CustomerRecord>("/customers", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
      }
      setCustomerSheetOpen(false);
      setEditingCustomer(null);
      customerForm.reset();
      await loadCustomers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save customer.");
    }
  };

  const submitVendor = async (values: VendorCreateInput) => {
    try {
      setActionError(null);
      if (editingVendor) {
        await apiFetch<VendorRecord>(`/vendors/${editingVendor.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      } else {
        await apiFetch<VendorRecord>("/vendors", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
      }
      setVendorSheetOpen(false);
      setEditingVendor(null);
      vendorForm.reset();
      await loadVendors();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save vendor.");
    }
  };

  const submitItem = async (values: ItemCreateInput) => {
    try {
      setActionError(null);
      if (editingItem) {
        await apiFetch<ItemRecord>(`/items/${editingItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      } else {
        await apiFetch<ItemRecord>("/items", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
      }
      setItemSheetOpen(false);
      setEditingItem(null);
      itemForm.reset();
      await loadItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save item.");
    }
  };

  const submitTaxCode = async (values: TaxCodeCreateInput) => {
    try {
      setActionError(null);
      if (editingTaxCode) {
        await apiFetch<TaxCodeRecord>(`/tax-codes/${editingTaxCode.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      } else {
        await apiFetch<TaxCodeRecord>("/tax-codes", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(values),
        });
      }
      setTaxSheetOpen(false);
      setEditingTaxCode(null);
      taxForm.reset();
      await loadTaxCodes();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save tax code.");
    }
  };

  const updateCustomerStatus = async (customerId: string, isActive: boolean) => {
    try {
      setActionError(null);
      await apiFetch<CustomerRecord>(`/customers/${customerId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await loadCustomers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update customer.");
    }
  };

  const updateVendorStatus = async (vendorId: string, isActive: boolean) => {
    try {
      setActionError(null);
      await apiFetch<VendorRecord>(`/vendors/${vendorId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await loadVendors();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update vendor.");
    }
  };

  const updateItemStatus = async (itemId: string, isActive: boolean) => {
    try {
      setActionError(null);
      await apiFetch<ItemRecord>(`/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await loadItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update item.");
    }
  };

  const updateTaxStatus = async (taxCodeId: string, isActive: boolean) => {
    try {
      setActionError(null);
      await apiFetch<TaxCodeRecord>(`/tax-codes/${taxCodeId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await loadTaxCodes();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update tax code.");
    }
  };

  if (orgMissing) {
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <h1>Create your organization</h1>
        <p>Set up your base settings to begin configuring the chart of accounts.</p>
        <form onSubmit={form.handleSubmit(submitOrg)}>
          <div className="form-grid">
            <label>
              Organization Name *
              <Input {...form.register("name")} />
              {renderFieldError(form.formState.errors.name, "Enter an organization name.")}
            </label>
            <label>
              Country Code *
              <Input {...form.register("countryCode")} />
              {renderFieldError(form.formState.errors.countryCode, "Use a 2-letter country code.")}
            </label>
            <label>
              Base Currency *
              <Input {...form.register("baseCurrency")} />
              {renderFieldError(form.formState.errors.baseCurrency, "Use a 3-letter currency code.")}
            </label>
            <label>
              Fiscal Year Start Month *
              <Input type="number" min={1} max={12} {...form.register("fiscalYearStartMonth")} />
              {renderFieldError(form.formState.errors.fiscalYearStartMonth, "Enter a month between 1 and 12.")}
            </label>
            <label>
              VAT Enabled *
              <input type="checkbox" {...form.register("vatEnabled")} />
              {renderFieldError(form.formState.errors.vatEnabled)}
            </label>
            <label>
              VAT TRN
              <Input {...form.register("vatTrn")} />
              {renderFieldError(form.formState.errors.vatTrn, "Enter a valid VAT TRN.")}
            </label>
            <label>
              Time Zone *
              <Input {...form.register("timeZone")} />
              {renderFieldError(form.formState.errors.timeZone, "Enter a time zone.")}
            </label>
          </div>
          <div style={{ height: 16 }} />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Organization"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Dashboard</h1>
      <p>{status}</p>
      {orgName ? <p>Organization: {orgName}</p> : null}
      {loadingData ? <p>Loading organization data...</p> : null}
      {actionError ? <p style={{ color: "#b91c1c" }}>{actionError}</p> : null}
      <div style={{ height: 16 }} />
      {showOverview ? (
        <section>
          <h2>Get started</h2>
          <p>Use the sidebar to manage your chart of accounts and user access.</p>
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <strong>Chart of Accounts</strong>
              <p>{accounts.length} accounts configured</p>
            </div>
            <Button asChild variant="secondary">
              <a href="/dashboard?tab=accounts">Open accounts</a>
            </Button>
          </div>
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <strong>Customers</strong>
              <p>{customers.length} active customers</p>
            </div>
            <Button asChild variant="secondary">
              <a href="/dashboard?tab=customers">Open customers</a>
            </Button>
          </div>
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <strong>Vendors</strong>
              <p>{vendors.length} active vendors</p>
            </div>
            <Button asChild variant="secondary">
              <a href="/dashboard?tab=vendors">Open vendors</a>
            </Button>
          </div>
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <strong>Items</strong>
              <p>{items.length} items configured</p>
            </div>
            <Button asChild variant="secondary">
              <a href="/dashboard?tab=items">Open items</a>
            </Button>
          </div>
          {vatEnabled ? (
            <>
              <div style={{ height: 12 }} />
              <div className="section-header">
                <div>
                  <strong>Tax Codes</strong>
                  <p>{taxCodes.length} tax codes configured</p>
                </div>
                <Button asChild variant="secondary">
                  <a href="/dashboard?tab=taxes">Open tax codes</a>
                </Button>
              </div>
            </>
          ) : null}
          <div style={{ height: 12 }} />
          <div className="section-header">
            <div>
              <strong>Users</strong>
              <p>{memberships.length} team members</p>
            </div>
            <Button asChild variant="secondary">
              <a href="/dashboard?tab=users">Open users</a>
            </Button>
          </div>
        </section>
      ) : null}
      {showAccounts ? (
        <section id="accounts">
          <div className="section-header">
            <h2>Chart of Accounts</h2>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">New Account</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Create account</SheetTitle>
                </SheetHeader>
                <form onSubmit={accountForm.handleSubmit(submitAccount)}>
                  <div className="form-grid">
                    <label>
                      Code *
                      <Input {...accountForm.register("code")} />
                      {renderFieldError(accountForm.formState.errors.code, "Enter an account code.")}
                    </label>
                    <label>
                      Name *
                      <Input {...accountForm.register("name")} />
                      {renderFieldError(accountForm.formState.errors.name, "Enter an account name.")}
                    </label>
                    <label>
                      Type *
                      <Controller
                        control={accountForm.control}
                        name="type"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
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
                      {renderFieldError(accountForm.formState.errors.type, "Select an account type.")}
                    </label>
                    <label>
                      Subtype
                      <Controller
                        control={accountForm.control}
                        name="subtype"
                        render={({ field }) => (
                          <Select
                            value={field.value ?? "none"}
                            onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select subtype" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {filteredSubtypeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {formatLabel(option)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {renderFieldError(accountForm.formState.errors.subtype, "Select a subtype.")}
                    </label>
                  </div>
                  <div style={{ height: 12 }} />
                  <Button variant="secondary" type="submit">
                    Add Account
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{account.code}</TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{account.subtype ? formatLabel(account.subtype) : formatLabel(account.type)}</TableCell>
                  <TableCell>{account.isActive ? "Active" : "Inactive"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
      {showCustomers ? (
        <section id="customers">
          <div className="section-header">
            <h2>Customers</h2>
            <Button variant="secondary" onClick={() => openCustomerSheet()}>
              New Customer
            </Button>
          </div>
          <div className="form-grid">
            <label>
              Search
              <Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
            </label>
            <label>
              Status
              <Select value={customerStatus} onValueChange={setCustomerStatus}>
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
            <div style={{ alignSelf: "end" }}>
              <Button variant="secondary" onClick={() => loadCustomers()}>
                Apply Filters
              </Button>
            </div>
          </div>
          <div style={{ height: 12 }} />
          {loadingCustomers ? <p>Loading customers...</p> : null}
          {!loadingCustomers && customers.length === 0 ? <p>No customers yet. Add your first customer.</p> : null}
          {customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>{customer.name}</TableCell>
                    <TableCell>{customer.email ?? "-"}</TableCell>
                    <TableCell>{customer.phone ?? "-"}</TableCell>
                    <TableCell>{customer.paymentTermsDays} days</TableCell>
                    <TableCell>
                      <Select
                        value={customer.isActive ? "active" : "inactive"}
                        onValueChange={(value) => updateCustomerStatus(customer.id, value === "active")}
                      >
                        <SelectTrigger aria-label="Customer status toggle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => openCustomerSheet(customer)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          <Sheet
            open={customerSheetOpen}
            onOpenChange={(open) => {
              setCustomerSheetOpen(open);
              if (!open) {
                setEditingCustomer(null);
              }
            }}
          >
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{editingCustomer ? "Edit customer" : "Create customer"}</SheetTitle>
              </SheetHeader>
              <form onSubmit={customerForm.handleSubmit(submitCustomer)}>
                <div className="form-grid">
                  <label>
                    Name *
                    <Input {...customerForm.register("name")} />
                    {renderFieldError(customerForm.formState.errors.name, "Enter a customer name.")}
                  </label>
                  <label>
                    Email
                    <Input type="email" {...customerForm.register("email")} />
                    {renderFieldError(customerForm.formState.errors.email, "Enter a valid email.")}
                  </label>
                  <label>
                    Phone
                    <Input {...customerForm.register("phone")} />
                    {renderFieldError(customerForm.formState.errors.phone, "Enter a valid phone number.")}
                  </label>
                  <label>
                    Tax Registration Number
                    <Input {...customerForm.register("trn")} />
                    {renderFieldError(customerForm.formState.errors.trn)}
                  </label>
                  <label>
                    Payment Terms (days)
                    <Input type="number" min={0} {...customerForm.register("paymentTermsDays")} />
                    {renderFieldError(customerForm.formState.errors.paymentTermsDays, "Enter valid payment terms.")}
                  </label>
                  <label>
                    Credit Limit
                    <Input type="number" min={0} step="0.01" {...customerForm.register("creditLimit")} />
                    {renderFieldError(customerForm.formState.errors.creditLimit, "Enter a valid credit limit.")}
                  </label>
                  <label>
                    Billing Address
                    <Input {...customerForm.register("billingAddress")} />
                    {renderFieldError(customerForm.formState.errors.billingAddress)}
                  </label>
                  <label>
                    Shipping Address
                    <Input {...customerForm.register("shippingAddress")} />
                    {renderFieldError(customerForm.formState.errors.shippingAddress)}
                  </label>
                </div>
                <div style={{ height: 12 }} />
                <Button variant="secondary" type="submit">
                  {editingCustomer ? "Save Customer" : "Create Customer"}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        </section>
      ) : null}
      {showVendors ? (
        <section id="vendors">
          <div className="section-header">
            <h2>Vendors</h2>
            <Button variant="secondary" onClick={() => openVendorSheet()}>
              New Vendor
            </Button>
          </div>
          <div className="form-grid">
            <label>
              Search
              <Input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} />
            </label>
            <label>
              Status
              <Select value={vendorStatus} onValueChange={setVendorStatus}>
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
            <div style={{ alignSelf: "end" }}>
              <Button variant="secondary" onClick={() => loadVendors()}>
                Apply Filters
              </Button>
            </div>
          </div>
          <div style={{ height: 12 }} />
          {loadingVendors ? <p>Loading vendors...</p> : null}
          {!loadingVendors && vendors.length === 0 ? <p>No vendors yet. Add your first vendor.</p> : null}
          {vendors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell>{vendor.name}</TableCell>
                    <TableCell>{vendor.email ?? "-"}</TableCell>
                    <TableCell>{vendor.phone ?? "-"}</TableCell>
                    <TableCell>{vendor.paymentTermsDays} days</TableCell>
                    <TableCell>
                      <Select
                        value={vendor.isActive ? "active" : "inactive"}
                        onValueChange={(value) => updateVendorStatus(vendor.id, value === "active")}
                      >
                        <SelectTrigger aria-label="Vendor status toggle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => openVendorSheet(vendor)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          <Sheet
            open={vendorSheetOpen}
            onOpenChange={(open) => {
              setVendorSheetOpen(open);
              if (!open) {
                setEditingVendor(null);
              }
            }}
          >
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{editingVendor ? "Edit vendor" : "Create vendor"}</SheetTitle>
              </SheetHeader>
              <form onSubmit={vendorForm.handleSubmit(submitVendor)}>
                <div className="form-grid">
                  <label>
                    Name *
                    <Input {...vendorForm.register("name")} />
                    {renderFieldError(vendorForm.formState.errors.name, "Enter a vendor name.")}
                  </label>
                  <label>
                    Email
                    <Input type="email" {...vendorForm.register("email")} />
                    {renderFieldError(vendorForm.formState.errors.email, "Enter a valid email.")}
                  </label>
                  <label>
                    Phone
                    <Input {...vendorForm.register("phone")} />
                    {renderFieldError(vendorForm.formState.errors.phone, "Enter a valid phone number.")}
                  </label>
                  <label>
                    Tax Registration Number
                    <Input {...vendorForm.register("trn")} />
                    {renderFieldError(vendorForm.formState.errors.trn)}
                  </label>
                  <label>
                    Payment Terms (days)
                    <Input type="number" min={0} {...vendorForm.register("paymentTermsDays")} />
                    {renderFieldError(vendorForm.formState.errors.paymentTermsDays, "Enter valid payment terms.")}
                  </label>
                  <label>
                    Address
                    <Input {...vendorForm.register("address")} />
                    {renderFieldError(vendorForm.formState.errors.address)}
                  </label>
                </div>
                <div style={{ height: 12 }} />
                <Button variant="secondary" type="submit">
                  {editingVendor ? "Save Vendor" : "Create Vendor"}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        </section>
      ) : null}
      {showItems ? (
        <section id="items">
          <div className="section-header">
            <h2>Items</h2>
            <Button variant="secondary" onClick={() => openItemSheet()}>
              New Item
            </Button>
          </div>
          <div className="form-grid">
            <label>
              Search
              <Input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} />
            </label>
            <label>
              Status
              <Select value={itemStatus} onValueChange={setItemStatus}>
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
            <div style={{ alignSelf: "end" }}>
              <Button variant="secondary" onClick={() => loadItems()}>
                Apply Filters
              </Button>
            </div>
          </div>
          <div style={{ height: 12 }} />
          {loadingItems ? <p>Loading items...</p> : null}
          {!loadingItems && items.length === 0 ? <p>No items yet. Add your first product or service.</p> : null}
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sale Price</TableHead>
                  <TableHead>Income Account</TableHead>
                  <TableHead>Expense Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{formatLabel(item.type)}</TableCell>
                    <TableCell>{item.salePrice}</TableCell>
                    <TableCell>{item.incomeAccount?.name ?? "-"}</TableCell>
                    <TableCell>{item.expenseAccount?.name ?? "-"}</TableCell>
                    <TableCell>
                      <Select
                        value={item.isActive ? "active" : "inactive"}
                        onValueChange={(value) => updateItemStatus(item.id, value === "active")}
                      >
                        <SelectTrigger aria-label="Item status toggle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => openItemSheet(item)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          <Sheet
            open={itemSheetOpen}
            onOpenChange={(open) => {
              setItemSheetOpen(open);
              if (!open) {
                setEditingItem(null);
              }
            }}
          >
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{editingItem ? "Edit item" : "Create item"}</SheetTitle>
              </SheetHeader>
              <form onSubmit={itemForm.handleSubmit(submitItem)}>
                <div className="form-grid">
                  <label>
                    Name *
                    <Input {...itemForm.register("name")} />
                    {renderFieldError(itemForm.formState.errors.name, "Enter an item name.")}
                  </label>
                  <label>
                    Type *
                    <Controller
                      control={itemForm.control}
                      name="type"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Item type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {itemTypeOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {formatLabel(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(itemForm.formState.errors.type, "Select an item type.")}
                  </label>
                  <label>
                    SKU
                    <Input {...itemForm.register("sku")} />
                    {renderFieldError(itemForm.formState.errors.sku)}
                  </label>
                  <label>
                    Sale Price *
                    <Input type="number" min={0} step="0.01" {...itemForm.register("salePrice")} />
                    {renderFieldError(itemForm.formState.errors.salePrice, "Enter a valid sale price.")}
                  </label>
                  <label>
                    Purchase Price
                    <Input type="number" min={0} step="0.01" {...itemForm.register("purchasePrice")} />
                    {renderFieldError(itemForm.formState.errors.purchasePrice, "Enter a valid purchase price.")}
                  </label>
                  <label>
                    Income Account *
                    <Controller
                      control={itemForm.control}
                      name="incomeAccountId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Income account">
                            <SelectValue placeholder="Select income account" />
                          </SelectTrigger>
                          <SelectContent>
                            {incomeAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(itemForm.formState.errors.incomeAccountId, "Select an income account.")}
                  </label>
                  <label>
                    Expense Account *
                    <Controller
                      control={itemForm.control}
                      name="expenseAccountId"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Expense account">
                            <SelectValue placeholder="Select expense account" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {renderFieldError(itemForm.formState.errors.expenseAccountId, "Select an expense account.")}
                  </label>
                  {vatEnabled ? (
                    <label>
                      Default Tax Code
                      <Controller
                        control={itemForm.control}
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
                              {activeTaxCodes.map((code) => (
                                <SelectItem key={code.id} value={code.id}>
                                  {code.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {renderFieldError(itemForm.formState.errors.defaultTaxCodeId, "Select a tax code.")}
                    </label>
                  ) : null}
                </div>
                <div style={{ height: 12 }} />
                <Button variant="secondary" type="submit">
                  {editingItem ? "Save Item" : "Create Item"}
                </Button>
              </form>
            </SheetContent>
          </Sheet>
        </section>
      ) : null}
      {showTaxes ? (
        <section id="taxes">
          <div className="section-header">
            <h2>Tax Codes</h2>
            <Button variant="secondary" onClick={() => openTaxSheet()} disabled={!vatEnabled}>
              New Tax Code
            </Button>
          </div>
          {!vatEnabled ? <p>VAT is disabled for this organization.</p> : null}
          {vatEnabled ? (
            <>
              <div className="form-grid">
                <label>
                  Search
                  <Input value={taxSearch} onChange={(event) => setTaxSearch(event.target.value)} />
                </label>
                <label>
                  Status
                  <Select value={taxStatus} onValueChange={setTaxStatus}>
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
                  <Button variant="secondary" onClick={() => loadTaxCodes()}>
                    Apply Filters
                  </Button>
                </div>
              </div>
              <div style={{ height: 12 }} />
              {loadingTaxCodes ? <p>Loading tax codes...</p> : null}
              {!loadingTaxCodes && taxCodes.length === 0 ? <p>No tax codes yet. Add your first tax rate.</p> : null}
              {taxCodes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxCodes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell>{code.name}</TableCell>
                        <TableCell>{Number(code.rate)}%</TableCell>
                        <TableCell>{formatLabel(code.type)}</TableCell>
                        <TableCell>
                          <Select
                            value={code.isActive ? "active" : "inactive"}
                            onValueChange={(value) => updateTaxStatus(code.id, value === "active")}
                          >
                            <SelectTrigger aria-label="Tax status toggle">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button variant="secondary" onClick={() => openTaxSheet(code)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
              <Sheet
                open={taxSheetOpen}
                onOpenChange={(open) => {
                  setTaxSheetOpen(open);
                  if (!open) {
                    setEditingTaxCode(null);
                  }
                }}
              >
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>{editingTaxCode ? "Edit tax code" : "Create tax code"}</SheetTitle>
                  </SheetHeader>
                  <form onSubmit={taxForm.handleSubmit(submitTaxCode)}>
                    <div className="form-grid">
                      <label>
                        Name *
                        <Input {...taxForm.register("name")} />
                        {renderFieldError(taxForm.formState.errors.name, "Enter a tax code name.")}
                      </label>
                      <label>
                        Rate (%) *
                        <Input type="number" min={0} max={100} step="0.01" {...taxForm.register("rate")} />
                        {renderFieldError(taxForm.formState.errors.rate, "Enter a valid tax rate.")}
                      </label>
                      <label>
                        Type *
                        <Controller
                          control={taxForm.control}
                          name="type"
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger aria-label="Tax type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {taxTypeOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {formatLabel(option)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {renderFieldError(taxForm.formState.errors.type, "Select a tax type.")}
                      </label>
                    </div>
                    <div style={{ height: 12 }} />
                    <Button variant="secondary" type="submit">
                      {editingTaxCode ? "Save Tax Code" : "Create Tax Code"}
                    </Button>
                  </form>
                </SheetContent>
              </Sheet>
            </>
          ) : null}
        </section>
      ) : null}
      {showUsers ? (
        <section id="users">
          <div className="section-header">
            <h2>Users</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Invite User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite user</DialogTitle>
                </DialogHeader>
                <form onSubmit={inviteForm.handleSubmit(submitInvite)}>
                  <div className="form-grid">
                    <label>
                      Email *
                      <Input {...inviteForm.register("email")} />
                      {renderFieldError(inviteForm.formState.errors.email, "Enter a valid email.")}
                    </label>
                    <label>
                      Role *
                      <Controller
                        control={inviteForm.control}
                        name="roleId"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {renderFieldError(inviteForm.formState.errors.roleId, "Select a role.")}
                    </label>
                  </div>
                  <div style={{ height: 12 }} />
                  <Button variant="secondary" type="submit">
                    Send Invite
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((membership) => (
                <TableRow key={membership.id}>
                  <TableCell>{membership.user.email}</TableCell>
                  <TableCell>
                    <Select
                      value={membership.role.id}
                      onValueChange={(value) => updateMembership(membership.id, { roleId: value } as MembershipUpdateInput)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={membership.isActive ? "active" : "inactive"}
                      onValueChange={(value) => updateMembership(membership.id, { isActive: value === "active" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="card">Loading dashboard...</div>}>
      <DashboardPageInner />
    </Suspense>
  );
}
