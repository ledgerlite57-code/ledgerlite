"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiBaseUrl, apiFetch } from "../../src/lib/api";
import { clearAccessToken } from "../../src/lib/auth";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [orgName, setOrgName] = useState("Organization");
  const [vatEnabled, setVatEnabled] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      clearAccessToken();
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    apiFetch<{ name: string; vatEnabled?: boolean }>("/orgs/current")
      .then((org) => {
        if (active && org?.name) {
          setOrgName(org.name);
          setVatEnabled(Boolean(org?.vatEnabled));
        }
      })
      .catch(() => {
        if (active) {
          setOrgName("Organization");
          setVatEnabled(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>LedgerLite</h2>
        <nav>
          <>
            <a className="active" href="/dashboard">
              Dashboard
            </a>
            <a href="/invoices">Invoices</a>
            <a href="/payments-received">Payments</a>
            <a href="/bills">Bills</a>
            <a href="/dashboard?tab=accounts">Chart of Accounts</a>
            <a href="/dashboard?tab=customers">Customers</a>
            <a href="/dashboard?tab=vendors">Vendors</a>
            <a href="/dashboard?tab=items">Items</a>
            {vatEnabled ? <a href="/dashboard?tab=taxes">Tax Codes</a> : null}
            <a href="/dashboard?tab=users">Users</a>
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
