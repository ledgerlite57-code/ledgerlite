"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "../../lib/zod-resolver";
import { useForm } from "react-hook-form";
import {
  accountCreateSchema,
  accountSubtypeSchema,
  customerCreateSchema,
  inviteCreateSchema,
  itemCreateSchema,
  itemTypeSchema,
  orgCreateSchema,
  orgSettingsUpdateSchema,
  taxCodeCreateSchema,
  taxTypeSchema,
  vendorCreateSchema,
  Permissions,
  type AccountCreateInput,
  type AccountUpdateInput,
  type CustomerCreateInput,
  type InviteCreateInput,
  type ItemCreateInput,
  type MembershipUpdateInput,
  type OrgCreateInput,
  type OrgSettingsUpdateInput,
  type PaginatedResponse,
  type TaxCodeCreateInput,
  type VendorCreateInput,
} from "@ledgerlite/shared";
import type { accountTypeSchema } from "@ledgerlite/shared";
import { apiFetch } from "../../lib/api";
import { setAccessToken } from "../../lib/auth";
import { usePermissions } from "../auth/use-permissions";

const orgSetupSchema = orgCreateSchema.and(
  orgSettingsUpdateSchema.pick({
    defaultPaymentTerms: true,
    defaultVatBehavior: true,
    reportBasis: true,
  }),
);

type OrgSetupInput = OrgCreateInput &
  Pick<OrgSettingsUpdateInput, "defaultPaymentTerms" | "defaultVatBehavior" | "reportBasis">;

export type AddressPayload = { formatted?: string } | null;
export type OrgSummary = { id: string; name?: string; vatEnabled?: boolean };
export type CustomerRecord = {
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
export type VendorRecord = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  trn?: string | null;
  paymentTermsDays: number;
  address?: AddressPayload;
  isActive: boolean;
};
export type TaxCodeRecord = {
  id: string;
  name: string;
  rate: string | number;
  type: string;
  isActive: boolean;
};
export type AccountLite = {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
  isActive?: boolean;
};
export type ItemRecord = {
  id: string;
  name: string;
  type: string;
  sku?: string | null;
  salePrice: string | number;
  purchasePrice?: string | number | null;
  unitOfMeasure?: { id: string; name: string; symbol: string } | null;
  allowFractionalQty?: boolean;
  trackInventory?: boolean;
  reorderPoint?: number | null;
  openingQty?: string | number | null;
  openingValue?: string | number | null;
  incomeAccount: AccountLite;
  expenseAccount: AccountLite;
  inventoryAccount?: AccountLite | null;
  fixedAssetAccount?: AccountLite | null;
  defaultTaxCode?: { id: string; name: string } | null;
  isActive: boolean;
};
export type UnitOfMeasureRecord = {
  id: string;
  name: string;
  symbol: string;
  baseUnitId?: string | null;
  conversionRate?: string | number | null;
  isActive: boolean;
};
export type AccountRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  type: string;
  subtype?: string | null;
  parentAccountId?: string | null;
  normalBalance?: string | null;
  isReconcilable?: boolean;
  taxCodeId?: string | null;
  externalCode?: string | null;
  tags?: string[] | null;
  isSystem: boolean;
  isActive: boolean;
};
export type MembershipRecord = {
  id: string;
  isActive: boolean;
  user: { email: string };
  role: { id: string; name: string };
};
export type RoleRecord = { id: string; name: string };

export type DashboardState = ReturnType<typeof useDashboardState>;

const createIdempotencyKey = () => {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) {
      return uuid;
    }
  } catch {
    // Ignore secure-context or runtime crypto errors and use a deterministic fallback.
  }
  return `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function useDashboardState() {
  const searchParams = useSearchParams();
  const { status: authStatus, org, refresh, hasPermission, hasAnyPermission } = usePermissions();

  const [mounted, setMounted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountStatus, setAccountStatus] = useState("active");
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<UnitOfMeasureRecord[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);
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

  const orgName = org?.name ?? null;
  const vatEnabled = org?.vatEnabled ?? false;
  const orgMissing = authStatus === "ready" && !org;

  const status = useMemo(() => {
    if (authStatus === "loading") {
      return "Checking access...";
    }
    if (authStatus === "unauthenticated") {
      return "Session expired. Redirecting to login...";
    }
    if (authStatus === "error") {
      return "Failed to reach API.";
    }
    if (orgMissing) {
      return "Organization setup required.";
    }
    return "Organization ready.";
  }, [authStatus, orgMissing]);

  const canCreateOrg = hasPermission(Permissions.ORG_WRITE) || orgMissing;
  const canViewAccounts = hasPermission(Permissions.COA_READ);
  const canManageAccounts = hasPermission(Permissions.COA_WRITE);
  const canViewCustomers = hasPermission(Permissions.CUSTOMER_READ);
  const canManageCustomers = hasPermission(Permissions.CUSTOMER_WRITE);
  const canViewVendors = hasPermission(Permissions.VENDOR_READ);
  const canManageVendors = hasPermission(Permissions.VENDOR_WRITE);
  const canViewItems = hasPermission(Permissions.ITEM_READ);
  const canManageItems = hasPermission(Permissions.ITEM_WRITE);
  const canViewTaxes = hasPermission(Permissions.TAX_READ);
  const canManageTaxes = hasPermission(Permissions.TAX_WRITE);
  const canViewUsers = hasAnyPermission(Permissions.USER_MANAGE, Permissions.USER_INVITE);
  const canManageUsers = hasPermission(Permissions.USER_MANAGE);
  const canInviteUsers = hasPermission(Permissions.USER_INVITE);

  const requestedTab = searchParams.get("tab") ?? "overview";
  const tab = useMemo(() => {
    if (requestedTab === "accounts" && !canViewAccounts) {
      return "overview";
    }
    if (requestedTab === "customers" && !canViewCustomers) {
      return "overview";
    }
    if (requestedTab === "vendors" && !canViewVendors) {
      return "overview";
    }
    if (requestedTab === "items" && !canViewItems) {
      return "overview";
    }
    if (requestedTab === "taxes" && (!canViewTaxes || !vatEnabled)) {
      return "overview";
    }
    if (requestedTab === "users" && !canViewUsers) {
      return "overview";
    }
    if (
      requestedTab === "accounts" ||
      requestedTab === "customers" ||
      requestedTab === "vendors" ||
      requestedTab === "items" ||
      requestedTab === "taxes" ||
      requestedTab === "users"
    ) {
      return requestedTab;
    }
    return "overview";
  }, [
    requestedTab,
    canViewAccounts,
    canViewCustomers,
    canViewVendors,
    canViewItems,
    canViewTaxes,
    canViewUsers,
      vatEnabled,
    ]);

  const unwrapList = <T,>(payload: PaginatedResponse<T> | T[] | null | undefined): T[] => {
    if (!payload) {
      return [];
    }
    return Array.isArray(payload) ? payload : payload.data ?? [];
  };

  const showAccounts = tab === "accounts";
  const showCustomers = tab === "customers";
  const showVendors = tab === "vendors";
  const showItems = tab === "items";
  const showTaxes = tab === "taxes";
  const showUsers = tab === "users";
  const showOverview = tab === "overview";

  const isDevPrefill = process.env.NODE_ENV === "development";
  const orgDefaults: OrgSetupInput = {
    name: isDevPrefill ? "LedgerLite Demo" : "",
    legalName: isDevPrefill ? "LedgerLite Trading LLC" : "",
    tradeLicenseNumber: isDevPrefill ? "TL-000001" : "",
    address: {
      line1: isDevPrefill ? "Sheikh Zayed Road" : "",
      line2: "",
      city: isDevPrefill ? "Dubai" : "",
      region: isDevPrefill ? "Dubai" : "",
      postalCode: isDevPrefill ? "00000" : "",
      country: "AE",
    },
    phone: isDevPrefill ? "+971500000000" : "",
    industryType: isDevPrefill ? "Trading" : "",
    defaultLanguage: "en-US",
    dateFormat: "DD/MM/YYYY",
    numberFormat: "1,234.56",
    countryCode: "AE",
    baseCurrency: "AED",
    fiscalYearStartMonth: 1,
    vatEnabled: isDevPrefill,
    vatTrn: isDevPrefill ? "123456789012345" : "",
    timeZone: "Asia/Dubai",
    defaultPaymentTerms: 30,
    defaultVatBehavior: "EXCLUSIVE",
    reportBasis: "ACCRUAL",
  };

  const form = useForm<OrgSetupInput>({
    resolver: zodResolver(orgSetupSchema),
    defaultValues: orgDefaults,
  });
  const isSubmitting = useMemo(() => form.formState.isSubmitting, [form.formState.isSubmitting]);
  const accountDefaults: AccountCreateInput = {
    code: "",
    name: "",
    type: "ASSET",
    subtype: undefined,
    parentAccountId: "",
    description: "",
    normalBalance: "DEBIT",
    isReconcilable: false,
    taxCodeId: "",
    externalCode: "",
    tags: [],
    isActive: true,
  };
  const accountForm = useForm<AccountCreateInput>({
    resolver: zodResolver(accountCreateSchema),
    defaultValues: accountDefaults,
  });
  type AccountType = (typeof accountTypeSchema.options)[number];
  type AccountSubtype = (typeof accountSubtypeSchema.options)[number];

  const accountSubtypeOptions = accountSubtypeSchema.options as readonly AccountSubtype[];
  const accountSubtypeByType = useMemo<Record<AccountType, readonly AccountSubtype[]>>(
    () => ({
      ASSET: ["BANK", "CASH", "AR", "VAT_RECEIVABLE", "VENDOR_PREPAYMENTS"],
      LIABILITY: ["AP", "VAT_PAYABLE", "CUSTOMER_ADVANCES"],
      EQUITY: ["EQUITY"],
      INCOME: ["SALES"],
      EXPENSE: ["EXPENSE"],
    }),
    [],
  );
  const normalBalanceByType: Record<AccountType, "DEBIT" | "CREDIT"> = {
    ASSET: "DEBIT",
    EXPENSE: "DEBIT",
    LIABILITY: "CREDIT",
    EQUITY: "CREDIT",
    INCOME: "CREDIT",
  };
  const itemTypeOptions = itemTypeSchema.options;
  const taxTypeOptions = taxTypeSchema.options;
  const selectedAccountType = accountForm.watch("type") as AccountType;
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
      unitOfMeasureId: "",
      allowFractionalQty: true,
      incomeAccountId: "",
      expenseAccountId: "",
      inventoryAccountId: "",
      fixedAssetAccountId: "",
      defaultTaxCodeId: "",
      trackInventory: false,
      reorderPoint: undefined,
      openingQty: undefined,
      openingValue: undefined,
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
  }, []);

  useEffect(() => {
    if (!mounted || authStatus !== "ready" || !org) {
      return;
    }

    let active = true;
    setLoadingData(true);
    setActionError(null);

    const requests: Promise<void>[] = [];

    if (canViewAccounts) {
      requests.push(
        apiFetch<AccountRecord[]>("/accounts").then((data) => {
          if (active) {
            setAccounts(data);
          }
        }),
      );
    } else if (active) {
      setAccounts([]);
    }

    if (canManageUsers) {
      requests.push(
        apiFetch<MembershipRecord[]>("/orgs/users").then((data) => {
          if (active) {
            setMemberships(data);
          }
        }),
      );
    } else if (active) {
      setMemberships([]);
    }

    if (canInviteUsers) {
      requests.push(
        apiFetch<RoleRecord[]>("/orgs/roles").then((data) => {
          if (active) {
            setRoles(data);
          }
        }),
      );
    } else if (active) {
      setRoles([]);
    }

    Promise.all(requests)
      .catch((err) => {
        if (active) {
          setActionError(err instanceof Error ? err.message : "Unable to load organization data.");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingData(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mounted, authStatus, org, canViewAccounts, canManageUsers, canInviteUsers]);

  const submitOrg = async (values: OrgSetupInput) => {
    if (!canCreateOrg) {
      return;
    }
    try {
      setActionError(null);
      const { defaultPaymentTerms, defaultVatBehavior, reportBasis, ...orgValues } = values;
      const result = await apiFetch<{ org: OrgSummary; accessToken: string }>("/orgs", {
        method: "POST",
        headers: {
          "Idempotency-Key": createIdempotencyKey(),
        },
        body: JSON.stringify(orgValues),
      });
      setAccessToken(result.accessToken);
      await apiFetch("/orgs/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultPaymentTerms, defaultVatBehavior, reportBasis }),
      });
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to create organization.");
    }
  };

  const submitAccount = async (values: AccountCreateInput) => {
    if (!canManageAccounts) {
      return;
    }
    try {
      setActionError(null);
      if (editingAccount) {
        const updated = await apiFetch<AccountRecord>(`/accounts/${editingAccount.id}`, {
          method: "PATCH",
          body: JSON.stringify(values as AccountUpdateInput),
        });
        setAccounts((prev) =>
          prev.map((account) => (account.id === updated.id ? updated : account)).sort((a, b) => a.code.localeCompare(b.code)),
        );
      } else {
        const result = await apiFetch<AccountRecord>("/accounts", {
          method: "POST",
          body: JSON.stringify(values),
        });
        setAccounts((prev) => [...prev, result].sort((a, b) => a.code.localeCompare(b.code)));
      }
      setAccountDialogOpen(false);
      setEditingAccount(null);
      accountForm.reset(accountDefaults);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to save account.");
    }
  };

  const submitInvite = async (values: InviteCreateInput) => {
    if (!canInviteUsers) {
      return;
    }
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
    if (!canManageUsers) {
      return;
    }
    try {
      setActionError(null);
      const updated = await apiFetch<MembershipRecord>(`/orgs/users/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setMemberships((prev) => prev.map((item) => (item.id === membershipId ? updated : item)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update membership.");
    }
  };

  const buildQuery = (search: string, statusValue: string) => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("q", search.trim());
      params.set("search", search.trim());
    }
    if (statusValue !== "all") {
      params.set("isActive", statusValue === "active" ? "true" : "false");
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const loadCustomers = async (search = customerSearch, statusValue = customerStatus) => {
    if (!canViewCustomers) {
      return;
    }
      setLoadingCustomers(true);
      try {
        setActionError(null);
        const result = await apiFetch<PaginatedResponse<CustomerRecord>>(`/customers${buildQuery(search, statusValue)}`);
        setCustomers(unwrapList(result));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load customers.");
      } finally {
        setLoadingCustomers(false);
      }
  };

  const loadVendors = async (search = vendorSearch, statusValue = vendorStatus) => {
    if (!canViewVendors) {
      return;
    }
      setLoadingVendors(true);
      try {
        setActionError(null);
        const result = await apiFetch<PaginatedResponse<VendorRecord> | VendorRecord[]>(
          `/vendors${buildQuery(search, statusValue)}`,
        );
        setVendors(unwrapList(result));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load vendors.");
      } finally {
        setLoadingVendors(false);
      }
  };

  const loadItems = async (search = itemSearch, statusValue = itemStatus) => {
    if (!canViewItems) {
      return;
    }
      setLoadingItems(true);
      try {
        setActionError(null);
        const result = await apiFetch<PaginatedResponse<ItemRecord> | ItemRecord[]>(`/items${buildQuery(search, statusValue)}`);
        setItems(unwrapList(result));
        if (vatEnabled && canViewTaxes && taxCodes.length === 0) {
          const taxResult = await apiFetch<PaginatedResponse<TaxCodeRecord> | TaxCodeRecord[]>("/tax-codes");
          setTaxCodes(unwrapList(taxResult));
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load items.");
      } finally {
        setLoadingItems(false);
    }
  };

  const loadUnits = async () => {
    if (!canViewItems) {
      return;
    }
      setLoadingUnits(true);
      try {
        const result = await apiFetch<PaginatedResponse<UnitOfMeasureRecord> | UnitOfMeasureRecord[]>(
          "/units-of-measurement?isActive=true",
        );
        setUnitsOfMeasure(unwrapList(result));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Unable to load units of measure.");
      } finally {
        setLoadingUnits(false);
      }
  };

  const loadTaxCodes = async (search = taxSearch, statusValue = taxStatus) => {
    if (!vatEnabled || !canViewTaxes) {
      return;
    }
      setLoadingTaxCodes(true);
      try {
        setActionError(null);
        const result = await apiFetch<PaginatedResponse<TaxCodeRecord> | TaxCodeRecord[]>(
          `/tax-codes${buildQuery(search, statusValue)}`,
        );
        setTaxCodes(unwrapList(result));
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
    if (showItems) {
      loadUnits();
    }
    if (showTaxes) {
      loadTaxCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCustomers, showVendors, showItems, showTaxes, orgMissing, org, mounted]);

  useEffect(() => {
    if (!mounted || orgMissing || !org || !showItems) {
      return;
    }
    const handle = setTimeout(() => {
      loadItems(itemSearch, itemStatus);
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [mounted, orgMissing, org, showItems, itemSearch, itemStatus]);

  useEffect(() => {
    if (!mounted || orgMissing || !org || !showCustomers) {
      return;
    }
    const handle = setTimeout(() => {
      loadCustomers(customerSearch, customerStatus);
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [mounted, orgMissing, org, showCustomers, customerSearch, customerStatus]);

  useEffect(() => {
    if (!mounted || orgMissing || !org || !showVendors) {
      return;
    }
    const handle = setTimeout(() => {
      loadVendors(vendorSearch, vendorStatus);
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [mounted, orgMissing, org, showVendors, vendorSearch, vendorStatus]);

  useEffect(() => {
    if (!itemSheetOpen) {
      return;
    }
    const baseUnitId =
      unitsOfMeasure.find((unit) => unit.name === "Each" && unit.isActive)?.id ??
      unitsOfMeasure.find((unit) => !unit.baseUnitId && unit.isActive)?.id ??
      "";
    if (!baseUnitId) {
      return;
    }
    const current = itemForm.getValues("unitOfMeasureId");
    if (!current) {
      itemForm.setValue("unitOfMeasureId", baseUnitId);
    }
  }, [itemForm, itemSheetOpen, unitsOfMeasure]);

  const openCustomerSheet = (customer?: CustomerRecord) => {
    if (!canManageCustomers) {
      return;
    }
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
    if (!canManageVendors) {
      return;
    }
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
    if (!canManageItems) {
      return;
    }
    if (unitsOfMeasure.length === 0) {
      loadUnits();
    }
    const baseUnitId =
      unitsOfMeasure.find((unit) => unit.name === "Each" && unit.isActive)?.id ??
      unitsOfMeasure.find((unit) => !unit.baseUnitId && unit.isActive)?.id ??
      "";
    setEditingItem(item ?? null);
    itemForm.reset({
      name: item?.name ?? "",
      type: (item?.type as ItemCreateInput["type"]) ?? "SERVICE",
      sku: item?.sku ?? "",
      salePrice: item?.salePrice !== null && item?.salePrice !== undefined ? Number(item.salePrice) : 0,
      purchasePrice:
        item?.purchasePrice !== null && item?.purchasePrice !== undefined ? Number(item.purchasePrice) : undefined,
      unitOfMeasureId: item?.unitOfMeasure?.id ?? baseUnitId,
      allowFractionalQty: item?.allowFractionalQty ?? true,
      incomeAccountId: item?.incomeAccount?.id ?? "",
      expenseAccountId: item?.expenseAccount?.id ?? "",
      inventoryAccountId: item?.inventoryAccount?.id ?? "",
      fixedAssetAccountId: item?.fixedAssetAccount?.id ?? "",
      defaultTaxCodeId: item?.defaultTaxCode?.id ?? "",
      trackInventory: item?.trackInventory ?? false,
      reorderPoint:
        item?.reorderPoint !== null && item?.reorderPoint !== undefined ? Number(item.reorderPoint) : undefined,
      openingQty: item?.openingQty !== null && item?.openingQty !== undefined ? Number(item.openingQty) : undefined,
      openingValue:
        item?.openingValue !== null && item?.openingValue !== undefined ? Number(item.openingValue) : undefined,
      isActive: item?.isActive ?? true,
    });
    if (vatEnabled && canViewTaxes && taxCodes.length === 0) {
      loadTaxCodes();
    }
    setItemSheetOpen(true);
  };

  const openTaxSheet = (taxCode?: TaxCodeRecord) => {
    if (!canManageTaxes) {
      return;
    }
    setEditingTaxCode(taxCode ?? null);
    taxForm.reset({
      name: taxCode?.name ?? "",
      rate: taxCode?.rate !== null && taxCode?.rate !== undefined ? Number(taxCode.rate) : 0,
      type: (taxCode?.type as TaxCodeCreateInput["type"]) ?? "STANDARD",
      isActive: taxCode?.isActive ?? true,
    });
    setTaxSheetOpen(true);
  };

  const openAccountDialog = (account?: AccountRecord) => {
    if (!canManageAccounts) {
      return;
    }
    const accountType = (account?.type as AccountCreateInput["type"]) ?? accountDefaults.type;
    const fallbackNormalBalance = normalBalanceByType[accountType] ?? "DEBIT";
    setEditingAccount(account ?? null);
    accountForm.reset({
      ...accountDefaults,
      code: account?.code ?? "",
      name: account?.name ?? "",
      description: account?.description ?? "",
      type: accountType,
      subtype: (account?.subtype as AccountCreateInput["subtype"]) ?? undefined,
      parentAccountId: account?.parentAccountId ?? "",
      normalBalance: (account?.normalBalance as AccountCreateInput["normalBalance"]) ?? fallbackNormalBalance,
      isReconcilable: account?.isReconcilable ?? false,
      taxCodeId: account?.taxCodeId ?? "",
      externalCode: account?.externalCode ?? "",
      tags: Array.isArray(account?.tags) ? account?.tags : [],
      isActive: account?.isActive ?? true,
    });
    if (vatEnabled && canViewTaxes && taxCodes.length === 0) {
      loadTaxCodes();
    }
    setAccountDialogOpen(true);
  };

  const submitCustomer = async (values: CustomerCreateInput) => {
    if (!canManageCustomers) {
      return;
    }
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
          headers: { "Idempotency-Key": createIdempotencyKey() },
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
    if (!canManageVendors) {
      return;
    }
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
          headers: { "Idempotency-Key": createIdempotencyKey() },
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
    if (!canManageItems) {
      return;
    }
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
          headers: { "Idempotency-Key": createIdempotencyKey() },
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
    if (!canManageTaxes) {
      return;
    }
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
          headers: { "Idempotency-Key": createIdempotencyKey() },
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
    if (!canManageCustomers) {
      return;
    }
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
    if (!canManageVendors) {
      return;
    }
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
    if (!canManageItems) {
      return;
    }
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
    if (!canManageTaxes) {
      return;
    }
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

  return {
    mounted,
    status,
    orgName,
    org,
    orgMissing,
    vatEnabled,
    actionError,
    setActionError,
    accounts,
    accountSearch,
    setAccountSearch,
    accountStatus,
    setAccountStatus,
    accountDialogOpen,
    setAccountDialogOpen,
    editingAccount,
    setEditingAccount,
    customers,
    vendors,
    items,
    unitsOfMeasure,
    taxCodes,
    memberships,
    roles,
    loadingData,
    loadingCustomers,
    loadingVendors,
    loadingItems,
    loadingUnits,
    loadingTaxCodes,
    customerSearch,
    setCustomerSearch,
    customerStatus,
    setCustomerStatus,
    vendorSearch,
    setVendorSearch,
    vendorStatus,
    setVendorStatus,
    itemSearch,
    setItemSearch,
    itemStatus,
    setItemStatus,
    taxSearch,
    setTaxSearch,
    taxStatus,
    setTaxStatus,
    customerSheetOpen,
    setCustomerSheetOpen,
    editingCustomer,
    setEditingCustomer,
    vendorSheetOpen,
    setVendorSheetOpen,
    editingVendor,
    setEditingVendor,
    itemSheetOpen,
    setItemSheetOpen,
    editingItem,
    setEditingItem,
    taxSheetOpen,
    setTaxSheetOpen,
    editingTaxCode,
    setEditingTaxCode,
    showAccounts,
    showCustomers,
    showVendors,
    showItems,
    showTaxes,
    showUsers,
    showOverview,
    canCreateOrg,
    canViewAccounts,
    canManageAccounts,
    canViewCustomers,
    canManageCustomers,
    canViewVendors,
    canManageVendors,
    canViewItems,
    canManageItems,
    canViewTaxes,
    canManageTaxes,
    canViewUsers,
    canManageUsers,
    canInviteUsers,
    form,
    isSubmitting,
    accountForm,
    accountSubtypeOptions,
    filteredSubtypeOptions,
    itemTypeOptions,
    taxTypeOptions,
    incomeAccounts,
    expenseAccounts,
    activeTaxCodes,
    inviteForm,
    customerForm,
    vendorForm,
    itemForm,
    taxForm,
    openAccountDialog,
    submitOrg,
    submitAccount,
    submitInvite,
    updateMembership,
    loadCustomers,
    loadVendors,
    loadItems,
    loadUnits,
    loadTaxCodes,
    openCustomerSheet,
    openVendorSheet,
    openItemSheet,
    openTaxSheet,
    submitCustomer,
    submitVendor,
    submitItem,
    submitTaxCode,
    updateCustomerStatus,
    updateVendorStatus,
    updateItemStatus,
    updateTaxStatus,
  };
}
