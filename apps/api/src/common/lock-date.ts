import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "@ledgerlite/shared";

type DateInput = Date | string | null | undefined;

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

export const ensureNotLocked = (lockDate: DateInput, docDate: DateInput, action: string) => {
  if (!isDateLocked(lockDate, docDate)) {
    return;
  }
  const lock = parseDate(lockDate)!;
  const doc = parseDate(docDate)!;
  const lockLabel = lock.toISOString().slice(0, 10);

  throw new BadRequestException({
    code: ErrorCodes.LOCK_DATE_VIOLATION,
    message: `Cannot ${action} a document dated on or before the lock date.`,
    hint: `Update the document date to after ${lockLabel} or adjust the lock date in settings.`,
    details: {
      lockDate: lock.toISOString(),
      docDate: doc.toISOString(),
      action,
    },
  });
};
