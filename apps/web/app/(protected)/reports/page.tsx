"use client";

import Link from "next/link";
import { Permissions } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";

const reports = [
  {
    title: "Trial Balance",
    description: "Verify debits and credits across all accounts.",
    href: "/reports/trial-balance",
  },
  {
    title: "Profit and Loss",
    description: "Summarize income and expenses for a period.",
    href: "/reports/profit-loss",
  },
  {
    title: "Balance Sheet",
    description: "Snapshot of assets, liabilities, and equity.",
    href: "/reports/balance-sheet",
  },
  {
    title: "AR Aging",
    description: "Outstanding receivables by aging bucket.",
    href: "/reports/ar-aging",
  },
  {
    title: "AP Aging",
    description: "Outstanding payables by aging bucket.",
    href: "/reports/ap-aging",
  },
  {
    title: "VAT Summary",
    description: "Output vs input VAT for the period.",
    href: "/reports/vat-summary",
  },
];

export default function ReportsPage() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(Permissions.REPORTS_VIEW);

  if (!canView) {
    return (
      <div className="card">
        <h1>Reports</h1>
        <p className="muted">You do not have permission to view reports.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="muted">Financial reports derived from posted ledger entries.</p>
        </div>
      </div>

      <div className="form-grid">
        {reports.map((report) => (
          <Link key={report.href} href={report.href} className="card" style={{ padding: 16, display: "block" }}>
            <strong>{report.title}</strong>
            <p className="muted" style={{ marginTop: 6 }}>
              {report.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
