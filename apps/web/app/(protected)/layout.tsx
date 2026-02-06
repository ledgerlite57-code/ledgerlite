"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  Dot,
  FileText,
  Home,
  Landmark,
  Package,
  Percent,
  Receipt,
  Ruler,
  Scale,
  ScrollText,
  Shield,
  Store,
  UploadCloud,
  Users,
  Menu,
  X,
} from "lucide-react";
import { Permissions } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { clearAccessToken } from "../../src/lib/auth";
import { cn } from "../../src/lib/utils";
import { ThemeToggle } from "../../src/lib/theme-toggle";
import { AppLogo } from "../../src/lib/logo-mark";
import { NonProductionSafetyBanner, ReleaseIdentityFooter } from "../../src/lib/ui-build-stamp";
import { PermissionsProvider, usePermissions } from "../../src/features/auth/use-permissions";

type SidebarCounts = {
  invoices?: number;
  paymentsReceived?: number;
  bills?: number;
  expenses?: number;
  vendorPayments?: number;
  pdc?: number;
  journals?: number;
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  visible: boolean;
  badgeKey?: keyof SidebarCounts;
  isSubItem?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

function ProtectedLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarCounts, setSidebarCounts] = useState<SidebarCounts>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { status, org, hasPermission, hasAnyPermission } = usePermissions();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      clearAccessToken();
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      clearAccessToken();
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "ready" || (status === "ready" && !org)) {
      return;
    }
    let active = true;
    const loadCounts = async () => {
      try {
        const data = await apiFetch<SidebarCounts>("/orgs/sidebar-counts");
        if (active) {
          setSidebarCounts(data ?? {});
        }
      } catch {
        if (active) {
          setSidebarCounts({});
        }
      }
    };
    loadCounts();
    return () => {
      active = false;
    };
  }, [status, org]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, searchParamString]);

  const nav = useMemo(() => {
    return {
      canViewOrg: hasPermission(Permissions.ORG_READ),
      canViewPlatform: hasAnyPermission(
        Permissions.PLATFORM_ORG_READ,
        Permissions.PLATFORM_ORG_WRITE,
        Permissions.PLATFORM_IMPERSONATE,
      ),
      canViewInvoices: hasPermission(Permissions.INVOICE_READ),
      canViewCreditNotes: hasPermission(Permissions.INVOICE_READ),
      canViewPayments: hasPermission(Permissions.PAYMENT_RECEIVED_READ),
      canViewBills: hasPermission(Permissions.BILL_READ),
      canViewExpenses: hasPermission(Permissions.EXPENSE_READ),
      canViewVendorPayments: hasPermission(Permissions.VENDOR_PAYMENT_READ),
      canViewPdc: hasPermission(Permissions.PDC_READ),
      canViewBankAccounts: hasAnyPermission(Permissions.BANK_READ, Permissions.BANK_WRITE),
      canImportBankTransactions: hasPermission(Permissions.BANK_WRITE),
      canReconcile: hasPermission(Permissions.RECONCILE_MANAGE),
      canViewAccounts: hasPermission(Permissions.COA_READ),
      canViewJournals: hasPermission(Permissions.JOURNAL_READ),
      canViewCustomers: hasPermission(Permissions.CUSTOMER_READ),
      canViewVendors: hasPermission(Permissions.VENDOR_READ),
      canViewItems: hasPermission(Permissions.ITEM_READ),
      canViewTaxes: hasPermission(Permissions.TAX_READ),
      canViewReports: hasPermission(Permissions.REPORTS_VIEW),
      canViewAuditLog: hasPermission(Permissions.AUDIT_VIEW),
      canViewUsers: hasAnyPermission(Permissions.USER_MANAGE, Permissions.USER_INVITE),
    };
  }, [hasPermission, hasAnyPermission]);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    if (!nav.canViewPlatform || org) {
      return;
    }
    if (pathname.startsWith("/platform")) {
      return;
    }
    router.replace("/platform/orgs");
  }, [status, nav.canViewPlatform, org, pathname, router]);

  const orgName = org?.name ?? (nav.canViewPlatform ? "LedgerLite Platform" : "Organization");
  const vatEnabled = Boolean(org?.vatEnabled);
  const dashboardTab = searchParams.get("tab") ?? "overview";
  const isDashboard = pathname === "/dashboard";
  const isHome = pathname === "/home";
  const isDashboardAccounts = isDashboard && dashboardTab === "accounts";
  const isDashboardCustomers = isDashboard && dashboardTab === "customers";
  const isDashboardVendors = isDashboard && dashboardTab === "vendors";
  const isDashboardItems = isDashboard && dashboardTab === "items";
  const isDashboardTaxes = isDashboard && dashboardTab === "taxes";
  const isDashboardUsers = isDashboard && dashboardTab === "users";
  const isInvoices = pathname.startsWith("/invoices");
  const isCreditNotes = pathname.startsWith("/credit-notes");
  const isPayments = pathname.startsWith("/payments-received");
  const isBills = pathname.startsWith("/bills");
  const isExpenses = pathname.startsWith("/expenses");
  const isVendorPayments = pathname.startsWith("/vendor-payments");
  const isPdc = pathname.startsWith("/pdc");
  const isBankAccounts = pathname.startsWith("/bank-accounts");
  const isBankTransactions = pathname.startsWith("/bank-transactions");
  const isReconciliation = pathname.startsWith("/reconciliation");
  const isJournals = pathname.startsWith("/journals");
  const isReportsHome = pathname === "/reports";
  const isTrialBalance = pathname === "/reports/trial-balance";
  const isProfitLoss = pathname === "/reports/profit-loss";
  const isBalanceSheet = pathname === "/reports/balance-sheet";
  const isArAging = pathname === "/reports/ar-aging";
  const isApAging = pathname === "/reports/ap-aging";
  const isVatSummary = pathname === "/reports/vat-summary";
  const isOrganizationSettings = pathname.startsWith("/settings/organization");
  const isAuditLog = pathname.startsWith("/settings/audit-log");
  const isUnitsOfMeasure = pathname.startsWith("/settings/units-of-measurement");
  const isPlatformOrgs = pathname.startsWith("/platform/orgs");

  const navGroups = useMemo<NavGroup[]>(() => {
    const groups: NavGroup[] = [
      {
        label: "Platform",
        items: [
          {
            label: "Organizations",
            href: "/platform/orgs",
            icon: Building2,
            isActive: isPlatformOrgs,
            visible: nav.canViewPlatform,
          },
        ],
      },
      {
        label: "Overview",
        items: [
          {
            label: "Home",
            href: "/home",
            icon: Home,
            isActive: isHome,
            visible: nav.canViewOrg,
          },
        ],
      },
      {
        label: "Sales",
        items: [
          {
            label: "Invoices",
            href: "/invoices",
            icon: Receipt,
            isActive: isInvoices,
            visible: nav.canViewInvoices,
            badgeKey: "invoices",
          },
          {
            label: "Credit Notes",
            href: "/credit-notes",
            icon: FileText,
            isActive: isCreditNotes,
            visible: nav.canViewCreditNotes,
          },
          {
            label: "Payments Received",
            href: "/payments-received",
            icon: CreditCard,
            isActive: isPayments,
            visible: nav.canViewPayments,
            badgeKey: "paymentsReceived",
          },
          {
            label: "Customers",
            href: "/dashboard?tab=customers",
            icon: Users,
            isActive: isDashboardCustomers,
            visible: nav.canViewCustomers,
          },
          {
            label: "Items",
            href: "/dashboard?tab=items",
            icon: Package,
            isActive: isDashboardItems,
            visible: nav.canViewItems,
          },
        ],
      },
      {
        label: "Purchases",
        items: [
          {
            label: "Bills",
            href: "/bills",
            icon: FileText,
            isActive: isBills,
            visible: nav.canViewBills,
            badgeKey: "bills",
          },
          {
            label: "Expenses",
            href: "/expenses",
            icon: ClipboardList,
            isActive: isExpenses,
            visible: nav.canViewExpenses,
            badgeKey: "expenses",
          },
          {
            label: "Vendor Payments",
            href: "/vendor-payments",
            icon: Banknote,
            isActive: isVendorPayments,
            visible: nav.canViewVendorPayments,
            badgeKey: "vendorPayments",
          },
          {
            label: "PDC Management",
            href: "/pdc",
            icon: FileText,
            isActive: isPdc,
            visible: nav.canViewPdc,
            badgeKey: "pdc",
          },
          {
            label: "Vendors",
            href: "/dashboard?tab=vendors",
            icon: Store,
            isActive: isDashboardVendors,
            visible: nav.canViewVendors,
          },
        ],
      },
      {
        label: "Banking",
        items: [
          {
            label: "Bank Accounts",
            href: "/bank-accounts",
            icon: Landmark,
            isActive: isBankAccounts,
            visible: nav.canViewBankAccounts,
          },
          {
            label: "Bank Import",
            href: "/bank-transactions/import",
            icon: UploadCloud,
            isActive: isBankTransactions,
            visible: nav.canImportBankTransactions,
          },
          {
            label: "Reconciliation",
            href: "/reconciliation",
            icon: Scale,
            isActive: isReconciliation,
            visible: nav.canReconcile,
          },
        ],
      },
      {
        label: "Accounting",
        items: [
          {
            label: "Chart of Accounts",
            href: "/dashboard?tab=accounts",
            icon: BookOpen,
            isActive: isDashboardAccounts,
            visible: nav.canViewAccounts,
          },
          {
            label: "Journals",
            href: "/journals",
            icon: ScrollText,
            isActive: isJournals,
            visible: nav.canViewJournals,
            badgeKey: "journals",
          },
        ],
      },
      {
        label: "Reports",
        items: [
          {
            label: "Reports",
            href: "/reports",
            icon: BarChart3,
            isActive: isReportsHome,
            visible: nav.canViewReports,
          },
          {
            label: "Trial Balance",
            href: "/reports/trial-balance",
            icon: Dot,
            isActive: isTrialBalance,
            visible: nav.canViewReports,
            isSubItem: true,
          },
          {
            label: "Profit & Loss",
            href: "/reports/profit-loss",
            icon: Dot,
            isActive: isProfitLoss,
            visible: nav.canViewReports,
            isSubItem: true,
          },
          {
            label: "Balance Sheet",
            href: "/reports/balance-sheet",
            icon: Dot,
            isActive: isBalanceSheet,
            visible: nav.canViewReports,
            isSubItem: true,
          },
          {
            label: "AR Aging",
            href: "/reports/ar-aging",
            icon: Dot,
            isActive: isArAging,
            visible: nav.canViewReports,
            isSubItem: true,
          },
          {
            label: "AP Aging",
            href: "/reports/ap-aging",
            icon: Dot,
            isActive: isApAging,
            visible: nav.canViewReports,
            isSubItem: true,
          },
          {
            label: "VAT Summary",
            href: "/reports/vat-summary",
            icon: Dot,
            isActive: isVatSummary,
            visible: nav.canViewReports,
            isSubItem: true,
          },
        ],
      },
      {
        label: "Settings",
        items: [
          {
            label: "Organization",
            href: "/settings/organization",
            icon: Building2,
            isActive: isOrganizationSettings,
            visible: nav.canViewOrg,
          },
          {
            label: "Users & Roles",
            href: "/dashboard?tab=users",
            icon: Shield,
            isActive: isDashboardUsers,
            visible: nav.canViewUsers,
          },
          {
            label: "Tax Codes",
            href: "/dashboard?tab=taxes",
            icon: Percent,
            isActive: isDashboardTaxes,
            visible: nav.canViewTaxes && vatEnabled,
          },
          {
            label: "Units of Measure",
            href: "/settings/units-of-measurement",
            icon: Ruler,
            isActive: isUnitsOfMeasure,
            visible: nav.canViewItems,
          },
          {
            label: "Audit Log",
            href: "/settings/audit-log",
            icon: ClipboardList,
            isActive: isAuditLog,
            visible: nav.canViewAuditLog,
          },
        ],
      },
    ];

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.visible),
      }))
      .filter((group) => group.items.length > 0);
  }, [
    isInvoices,
    isCreditNotes,
    isPayments,
    isHome,
    isDashboardCustomers,
    isDashboardItems,
    isBills,
    isVendorPayments,
    isPdc,
    isDashboardVendors,
    isBankAccounts,
    isBankTransactions,
    isReconciliation,
    isDashboardAccounts,
    isJournals,
    isReportsHome,
    isTrialBalance,
    isProfitLoss,
    isBalanceSheet,
    isArAging,
    isApAging,
    isVatSummary,
    isOrganizationSettings,
    isDashboardUsers,
    isDashboardTaxes,
    isAuditLog,
    isUnitsOfMeasure,
    isPlatformOrgs,
    nav,
    vatEnabled,
  ]);

  const isOnboarding = status === "ready" && !org && !nav.canViewPlatform;
  if (isOnboarding) {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-main">
          <div className="onboarding-brand">
            <AppLogo compactWordmark />
          </div>
          <main>{children}</main>
          <div style={{ height: 12 }} />
          <ReleaseIdentityFooter />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("app-shell", mobileNavOpen && "nav-open")}>
      <button
        type="button"
        className={cn("sidebar-overlay", mobileNavOpen && "open")}
        aria-label="Close navigation menu"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={cn("sidebar", mobileNavOpen && "open")}>
        <div className="sidebar-header">
          <AppLogo className="sidebar-brand" compactWordmark />
          <button
            type="button"
            className="mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-title">{group.label}</div>
              <div className="sidebar-group-items">
                {group.items.map((item) => {
                  const badgeValue = item.badgeKey ? sidebarCounts[item.badgeKey] : undefined;
                  const showBadge = typeof badgeValue === "number" && badgeValue > 0;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      className={cn("sidebar-link", item.isSubItem && "sub", item.isActive && "active")}
                      aria-current={item.isActive ? "page" : undefined}
                      href={item.href}
                    >
                      <Icon className="sidebar-icon" aria-hidden="true" />
                      <span className="sidebar-label">{item.label}</span>
                      {showBadge ? (
                        <span className="sidebar-badge" aria-label={`${badgeValue} drafts`}>
                          {badgeValue}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <NonProductionSafetyBanner />
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <AppLogo className="topbar-brand" compactWordmark />
            <strong className="topbar-org-name">{orgName}</strong>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <button type="button" className="link-button" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
          </div>
        </header>
        <main className="content app-content">{children}</main>
        <footer className="app-footer">
          <ReleaseIdentityFooter />
        </footer>
      </div>
    </div>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionsProvider>
      <ProtectedLayoutInner>{children}</ProtectedLayoutInner>
    </PermissionsProvider>
  );
}
