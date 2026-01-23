import * as React from "react";
import { formatDate } from "./format";
import { cn } from "./utils";

type DateInput = string | Date | null | undefined;

const parseDate = (value: DateInput) => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed;
};

export const isDateLocked = (lockDate: DateInput, docDate: DateInput) => {
  const lock = parseDate(lockDate);
  const doc = parseDate(docDate);
  if (!lock || !doc) {
    return false;
  }
  return doc.getTime() <= lock.getTime();
};

type LockWarningProps = {
  lockDate?: DateInput;
  docDate?: DateInput;
  actionLabel?: string;
  className?: string;
};

export const LockDateWarning = ({ lockDate, docDate, actionLabel = "update", className }: LockWarningProps) => {
  if (!isDateLocked(lockDate, docDate)) {
    return null;
  }

  const lockLabel = lockDate ? formatDate(lockDate) : "the lock date";

  return (
    <div className={cn("rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900", className)}>
      <div className="font-semibold">Lock date prevents {actionLabel}</div>
      <div>This document date is on or before the lock date ({lockLabel}).</div>
      <div className="muted">Update the date to continue, or change the lock date in settings.</div>
    </div>
  );
};
