"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { cn } from "../../lib/utils";
import { PageHeader } from "../../lib/ui-page-header";
import {
  DashboardAccountsSection,
  DashboardCustomersSection,
  DashboardItemsSection,
  DashboardOrgSetup,
  DashboardOverviewSection,
  DashboardTaxCodesSection,
  DashboardUsersSection,
  DashboardVendorsSection,
} from "./dashboard-sections";
import { useDashboardState } from "./use-dashboard-state";

export default function DashboardPage() {
  const dashboard = useDashboardState();

  if (!dashboard.mounted) {
    return null;
  }

  if (dashboard.orgMissing) {
    return <DashboardOrgSetup dashboard={dashboard} />;
  }

  const tabs = [
    {
      key: "overview",
      label: "Overview",
      href: "/dashboard?tab=overview",
      visible: true,
      active: dashboard.showOverview,
    },
    {
      key: "accounts",
      label: "Accounts",
      href: "/dashboard?tab=accounts",
      visible: dashboard.canViewAccounts,
      active: dashboard.showAccounts,
    },
    {
      key: "customers",
      label: "Customers",
      href: "/dashboard?tab=customers",
      visible: dashboard.canViewCustomers,
      active: dashboard.showCustomers,
    },
    {
      key: "vendors",
      label: "Vendors",
      href: "/dashboard?tab=vendors",
      visible: dashboard.canViewVendors,
      active: dashboard.showVendors,
    },
    {
      key: "items",
      label: "Items",
      href: "/dashboard?tab=items",
      visible: dashboard.canViewItems,
      active: dashboard.showItems,
    },
    {
      key: "taxes",
      label: "Tax Codes",
      href: "/dashboard?tab=taxes",
      visible: dashboard.canViewTaxes && dashboard.vatEnabled,
      active: dashboard.showTaxes,
    },
    {
      key: "users",
      label: "Users",
      href: "/dashboard?tab=users",
      visible: dashboard.canViewUsers,
      active: dashboard.showUsers,
    },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);

  return (
    <div className="card">
      <PageHeader
        title="Dashboard"
        description={dashboard.orgName ? `Welcome back to ${dashboard.orgName}.` : "Overview and setup."}
        icon={<BarChart3 className="h-5 w-5" />}
      />
      {dashboard.status && dashboard.status !== "Organization ready." ? (
        <div className="onboarding-callout">{dashboard.status}</div>
      ) : null}
      {dashboard.loadingData ? <p>Loading organization data...</p> : null}
      {dashboard.actionError ? <p className="form-error">{dashboard.actionError}</p> : null}
      {visibleTabs.length > 1 ? (
        <>
          <div className="dashboard-tabs">
            {visibleTabs.map((tab) => (
              <Link key={tab.key} href={tab.href} className={cn("dashboard-tab", tab.active && "active")}>
                {tab.label}
              </Link>
            ))}
          </div>
          <div style={{ height: 16 }} />
        </>
      ) : (
        <div style={{ height: 16 }} />
      )}
      {dashboard.showOverview ? <DashboardOverviewSection dashboard={dashboard} /> : null}
      {dashboard.showAccounts ? <DashboardAccountsSection dashboard={dashboard} /> : null}
      {dashboard.showCustomers ? <DashboardCustomersSection dashboard={dashboard} /> : null}
      {dashboard.showVendors ? <DashboardVendorsSection dashboard={dashboard} /> : null}
      {dashboard.showItems ? <DashboardItemsSection dashboard={dashboard} /> : null}
      {dashboard.showTaxes ? <DashboardTaxCodesSection dashboard={dashboard} /> : null}
      {dashboard.showUsers ? <DashboardUsersSection dashboard={dashboard} /> : null}
    </div>
  );
}
