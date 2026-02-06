"use client";

import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { Permissions } from "@ledgerlite/shared";
import { usePermissions } from "../../../src/features/auth/use-permissions";
import { PageHeader } from "../../../src/lib/ui-page-header";

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
        <PageHeader
          title="Reports"
          description="You do not have permission to view reports."
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <PageHeader
        title="Reports"
        description="Financial reports derived from posted ledger entries."
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <div className="form-grid">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="card"
            style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 16 }}
          >
            <div>
              <strong>{report.title}</strong>
              <p className="muted" style={{ marginTop: 6 }}>
                {report.description}
              </p>
            </div>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              View report
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
