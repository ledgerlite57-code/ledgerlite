"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Permissions } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { clearAccessToken } from "../../src/lib/auth";
import { PermissionsProvider, usePermissions } from "../../src/features/auth/use-permissions";

function ProtectedLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { status, org, hasPermission, hasAnyPermission } = usePermissions();

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
      canViewAccounts: hasPermission(Permissions.COA_READ),
      canViewCustomers: hasPermission(Permissions.CUSTOMER_READ),
      canViewVendors: hasPermission(Permissions.VENDOR_READ),
      canViewItems: hasPermission(Permissions.ITEM_READ),
      canViewTaxes: hasPermission(Permissions.TAX_READ),
      canViewUsers: hasAnyPermission(Permissions.USER_MANAGE, Permissions.USER_INVITE),
    };
  }, [hasPermission, hasAnyPermission]);

  const orgName = org?.name ?? "Organization";
  const vatEnabled = Boolean(org?.vatEnabled);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>LedgerLite</h2>
        <nav>
          <>
            <Link className="active" href="/dashboard">
              Dashboard
            </Link>
            {nav.canViewInvoices ? <Link href="/invoices">Invoices</Link> : null}
            {nav.canViewPayments ? <Link href="/payments-received">Payments</Link> : null}
            {nav.canViewBills ? <Link href="/bills">Bills</Link> : null}
            {nav.canViewAccounts ? <Link href="/dashboard?tab=accounts">Chart of Accounts</Link> : null}
            {nav.canViewCustomers ? <Link href="/dashboard?tab=customers">Customers</Link> : null}
            {nav.canViewVendors ? <Link href="/dashboard?tab=vendors">Vendors</Link> : null}
            {nav.canViewItems ? <Link href="/dashboard?tab=items">Items</Link> : null}
            {nav.canViewTaxes && vatEnabled ? <Link href="/dashboard?tab=taxes">Tax Codes</Link> : null}
            {nav.canViewUsers ? <Link href="/dashboard?tab=users">Users</Link> : null}
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
