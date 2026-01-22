"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Permissions } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { clearAccessToken } from "../../src/lib/auth";
import { PermissionsProvider, usePermissions } from "../../src/features/auth/use-permissions";

function ProtectedLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { status, org, hasPermission, hasAnyPermission } = usePermissions();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const nav = useMemo(() => {
    return {
      canViewInvoices: hasPermission(Permissions.INVOICE_READ),
      canViewPayments: hasPermission(Permissions.PAYMENT_RECEIVED_READ),
      canViewBills: hasPermission(Permissions.BILL_READ),
      canViewVendorPayments: hasPermission(Permissions.VENDOR_PAYMENT_READ),
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

  const orgName = org?.name ?? "Organization";
  const vatEnabled = Boolean(org?.vatEnabled);
  const dashboardTab = searchParams.get("tab") ?? "overview";
  const isDashboard = pathname === "/dashboard";
  const isDashboardOverview = isDashboard && dashboardTab === "overview";
  const isDashboardTab = (tab: string) => isDashboard && dashboardTab === tab;
  const isInvoices = pathname.startsWith("/invoices");
  const isPayments = pathname.startsWith("/payments-received");
  const isBills = pathname.startsWith("/bills");
  const isVendorPayments = pathname.startsWith("/vendor-payments");
  const isBankAccounts = pathname.startsWith("/bank-accounts");
  const isBankTransactions = pathname.startsWith("/bank-transactions");
  const isReconciliation = pathname.startsWith("/reconciliation");
  const isReports = pathname.startsWith("/reports");
  const isAuditLog = pathname.startsWith("/settings/audit-log");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>LedgerLite</h2>
        <nav>
          <>
            <Link className={isDashboardOverview ? "active" : undefined} aria-current={isDashboardOverview ? "page" : undefined} href="/dashboard">
              Dashboard
            </Link>
            {nav.canViewInvoices ? (
              <Link className={isInvoices ? "active" : undefined} aria-current={isInvoices ? "page" : undefined} href="/invoices">
                Invoices
              </Link>
            ) : null}
            {nav.canViewPayments ? (
              <Link className={isPayments ? "active" : undefined} aria-current={isPayments ? "page" : undefined} href="/payments-received">
                Payments
              </Link>
            ) : null}
            {nav.canViewBills ? (
              <Link className={isBills ? "active" : undefined} aria-current={isBills ? "page" : undefined} href="/bills">
                Bills
              </Link>
            ) : null}
            {nav.canViewVendorPayments ? (
              <Link
                className={isVendorPayments ? "active" : undefined}
                aria-current={isVendorPayments ? "page" : undefined}
                href="/vendor-payments"
              >
                Vendor Payments
              </Link>
            ) : null}
            {nav.canViewBankAccounts ? (
              <Link
                className={isBankAccounts ? "active" : undefined}
                aria-current={isBankAccounts ? "page" : undefined}
                href="/bank-accounts"
              >
                Bank Accounts
              </Link>
            ) : null}
            {nav.canImportBankTransactions ? (
              <Link
                className={isBankTransactions ? "active" : undefined}
                aria-current={isBankTransactions ? "page" : undefined}
                href="/bank-transactions/import"
              >
                Import Bank Transactions
              </Link>
            ) : null}
            {nav.canReconcile ? (
              <Link
                className={isReconciliation ? "active" : undefined}
                aria-current={isReconciliation ? "page" : undefined}
                href="/reconciliation"
              >
                Reconciliation
              </Link>
            ) : null}
            {nav.canViewAccounts ? (
              <Link
                className={isDashboardTab("accounts") ? "active" : undefined}
                aria-current={isDashboardTab("accounts") ? "page" : undefined}
                href="/dashboard?tab=accounts"
              >
                Chart of Accounts
              </Link>
            ) : null}
            {nav.canViewJournals ? (
              <Link
                className={pathname.startsWith("/journals") ? "active" : undefined}
                aria-current={pathname.startsWith("/journals") ? "page" : undefined}
                href="/journals"
              >
                Journals
              </Link>
            ) : null}
            {nav.canViewCustomers ? (
              <Link
                className={isDashboardTab("customers") ? "active" : undefined}
                aria-current={isDashboardTab("customers") ? "page" : undefined}
                href="/dashboard?tab=customers"
              >
                Customers
              </Link>
            ) : null}
            {nav.canViewVendors ? (
              <Link
                className={isDashboardTab("vendors") ? "active" : undefined}
                aria-current={isDashboardTab("vendors") ? "page" : undefined}
                href="/dashboard?tab=vendors"
              >
                Vendors
              </Link>
            ) : null}
            {nav.canViewItems ? (
              <Link
                className={isDashboardTab("items") ? "active" : undefined}
                aria-current={isDashboardTab("items") ? "page" : undefined}
                href="/dashboard?tab=items"
              >
                Items
              </Link>
            ) : null}
            {nav.canViewTaxes && vatEnabled ? (
              <Link
                className={isDashboardTab("taxes") ? "active" : undefined}
                aria-current={isDashboardTab("taxes") ? "page" : undefined}
                href="/dashboard?tab=taxes"
              >
                Tax Codes
              </Link>
            ) : null}
            {nav.canViewUsers ? (
              <Link
                className={isDashboardTab("users") ? "active" : undefined}
                aria-current={isDashboardTab("users") ? "page" : undefined}
                href="/dashboard?tab=users"
              >
                Users
              </Link>
            ) : null}
            {nav.canViewReports ? (
              <Link className={isReports ? "active" : undefined} aria-current={isReports ? "page" : undefined} href="/reports">
                Reports
              </Link>
            ) : null}
            {nav.canViewAuditLog ? (
              <Link
                className={isAuditLog ? "active" : undefined}
                aria-current={isAuditLog ? "page" : undefined}
                href="/settings/audit-log"
              >
                Audit Log
              </Link>
            ) : null}
          </>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <strong>{orgName}</strong>
          <button type="button" className="link-button" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </header>
        <main className="content">{children}</main>
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
