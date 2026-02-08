import * as React from "react";
import { cn } from "./utils";

const STATUS_CLASS_BY_STATUS: Record<string, string> = {
  draft: "draft",
  posted: "posted",
  void: "void",
  active: "posted",
  inactive: "draft",
  open: "posted",
  overdue: "void",
  closed: "draft",
  sent: "posted",
  partially_received: "posted",
  received: "posted",
  pending_approval: "draft",
  approved: "posted",
  scheduled: "posted",
  deposited: "posted",
  cleared: "posted",
  bounced: "void",
  cancelled: "void",
  pending: "draft",
  "not started": "draft",
  not_started: "draft",
  "in progress": "posted",
  in_progress: "posted",
  completed: "posted",
  not_applicable: "draft",
  accepted: "posted",
  expired: "void",
  revoked: "void",
};

type StatusChipProps = {
  status?: string | null;
  className?: string;
};

export const StatusChip = ({ status, className }: StatusChipProps) => {
  const label = (status ?? "DRAFT").toUpperCase();
  const statusKey = label.toLowerCase();
  const statusClass = STATUS_CLASS_BY_STATUS[statusKey] ?? "draft";

  return <span className={cn("status-badge", statusClass, className)}>{label}</span>;
};
