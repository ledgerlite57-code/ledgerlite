"use client";

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

  return (
    <div className="card">
      <h1>Dashboard</h1>
      {dashboard.orgName ? <p className="muted">Welcome back to {dashboard.orgName}.</p> : null}
      {dashboard.status && dashboard.status !== "Organization ready." ? (
        <div className="onboarding-callout">{dashboard.status}</div>
      ) : null}
      {dashboard.loadingData ? <p>Loading organization data...</p> : null}
      {dashboard.actionError ? <p className="form-error">{dashboard.actionError}</p> : null}
      <div style={{ height: 16 }} />
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
