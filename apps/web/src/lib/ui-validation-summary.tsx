import * as React from "react";

type ValidationSummaryProps = {
  errors: unknown;
  title?: string;
  className?: string;
};

type ValidationEntry = {
  key: string;
  path?: string;
  message: string;
  hint?: string;
};

const FIELD_ID_PREFIX = "field-";

function pathToFieldId(path: string) {
  return `${FIELD_ID_PREFIX}${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

function getHint(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("required")) {
    return "Enter a value before saving.";
  }
  if (lower.includes("invalid date") || lower.includes("date")) {
    return "Use a valid calendar date.";
  }
  if (lower.includes("greater than") || lower.includes("must be positive")) {
    return "Use a number greater than zero.";
  }
  if (lower.includes("currency")) {
    return "Pick the same currency used for this transaction.";
  }
  if (lower.includes("select")) {
    return "Choose an option from the list.";
  }
  return undefined;
}

function collectEntries(value: unknown, entries: ValidationEntry[], path = "") {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      entries.push({ key: `${path}:${trimmed}`, path: path || undefined, message: trimmed, hint: getHint(trimmed) });
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") {
    const trimmed = record.message.trim();
    if (trimmed) {
      entries.push({ key: `${path}:${trimmed}`, path: path || undefined, message: trimmed, hint: getHint(trimmed) });
    }
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key === "message" || key === "type" || key === "ref") {
      continue;
    }
    const nextPath = path ? `${path}.${key}` : key;
    collectEntries(nested, entries, nextPath);
  }
}

export function ValidationSummary({
  errors,
  title = "Please fix the following fields:",
  className,
}: ValidationSummaryProps) {
  const messages = React.useMemo(() => {
    const entries: ValidationEntry[] = [];
    collectEntries(errors, entries);
    const deduped = new Map<string, ValidationEntry>();
    for (const entry of entries) {
      if (!deduped.has(entry.key)) {
        deduped.set(entry.key, entry);
      }
    }
    return Array.from(deduped.values());
  }, [errors]);

  const focusField = React.useCallback((path?: string) => {
    if (!path) {
      return;
    }
    const id = pathToFieldId(path);
    const field = document.getElementById(id) as HTMLElement | null;
    if (!field) {
      return;
    }
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof (field as HTMLInputElement).focus === "function") {
      (field as HTMLInputElement).focus();
    }
  }, []);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={className ?? "rounded-md border border-destructive/30 bg-destructive/5 p-3"}>
      <p className="form-error" style={{ marginBottom: 8 }}>
        {title}
      </p>
      <ul className="list-disc pl-5">
        {messages.map((entry) => (
          <li key={entry.key} className="text-sm">
            {entry.path ? (
              <button type="button" className="validation-link" onClick={() => focusField(entry.path)}>
                {entry.message}
              </button>
            ) : (
              <span>{entry.message}</span>
            )}
            {entry.hint ? <span className="muted"> Hint: {entry.hint}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
