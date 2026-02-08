"use client";

import type { ReactNode } from "react";

type AdvancedFilterPanelProps = {
  open: boolean;
  title?: string;
  description?: string;
  children: ReactNode;
};

export const AdvancedFilterPanel = ({
  open,
  title = "Advanced Filters",
  description = "Use detailed criteria when quick filters are not enough.",
  children,
}: AdvancedFilterPanelProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="filter-advanced-panel">
      <div className="filter-advanced-header">
        <strong>{title}</strong>
        <p className="muted">{description}</p>
      </div>
      <div className="filter-advanced-grid">{children}</div>
    </div>
  );
};

