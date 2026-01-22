"use client";

import { Suspense } from "react";
import DashboardPage from "../../../src/features/dashboard/dashboard-page";

export default function DashboardRoute() {
  return (
    <Suspense fallback={<div className="card">Loading dashboard...</div>}>
      <DashboardPage />
    </Suspense>
  );
}
