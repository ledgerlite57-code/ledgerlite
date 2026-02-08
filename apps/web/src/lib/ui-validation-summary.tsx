import * as React from "react";

type ValidationSummaryProps = {
  errors: unknown;
  title?: string;
  className?: string;
};

function collectMessages(value: unknown, messages: Set<string>) {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      messages.add(trimmed);
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
      messages.add(trimmed);
    }
  }

  for (const nested of Object.values(record)) {
    collectMessages(nested, messages);
  }
}

export function ValidationSummary({
  errors,
  title = "Please fix the following fields:",
  className,
}: ValidationSummaryProps) {
  const messages = React.useMemo(() => {
    const unique = new Set<string>();
    collectMessages(errors, unique);
    return Array.from(unique);
  }, [errors]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className={className ?? "rounded-md border border-destructive/30 bg-destructive/5 p-3"}>
      <p className="form-error" style={{ marginBottom: 8 }}>
        {title}
      </p>
      <ul className="list-disc pl-5">
        {messages.map((message) => (
          <li key={message} className="text-sm">
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
