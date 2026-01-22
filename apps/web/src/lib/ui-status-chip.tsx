import * as React from "react";
import { cn } from "./utils";

const STATUS_CLASSES = new Set(["draft", "posted", "void"]);

type StatusChipProps = {
  status?: string | null;
  className?: string;
};

export const StatusChip = ({ status, className }: StatusChipProps) => {
  const label = (status ?? "DRAFT").toUpperCase();
  const statusKey = label.toLowerCase();
  const statusClass = STATUS_CLASSES.has(statusKey) ? statusKey : "draft";

  return <span className={cn("status-badge", statusClass, className)}>{label}</span>;
};
