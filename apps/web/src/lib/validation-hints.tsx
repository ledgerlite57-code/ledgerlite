import type { ReactNode } from "react";

type InlineFieldErrorArgs = {
  message?: string;
  hint?: string;
};

const FALLBACK_HINT = "Review this value and correct it before saving.";

const deriveHintFromMessage = (message: string): string => {
  const normalized = message.toLowerCase();

  if (normalized.includes("required")) {
    return "This field is required.";
  }

  if (normalized.includes("invalid date")) {
    return "Use a valid date in YYYY-MM-DD format.";
  }

  if (
    normalized.includes("expected number") ||
    normalized.includes("received nan") ||
    normalized.includes("must be a number")
  ) {
    return "Enter a numeric value without commas or symbols.";
  }

  if (normalized.includes("greater than or equal to 0")) {
    return "Enter 0 or a positive value.";
  }

  if (normalized.includes("greater than 0")) {
    return "Enter a value greater than 0.";
  }

  if (normalized.includes("at least")) {
    return "Increase the value to meet the minimum requirement.";
  }

  if (normalized.includes("at most")) {
    return "Reduce the value to stay within the allowed maximum.";
  }

  if (normalized.includes("invalid enum")) {
    return "Choose one of the listed options.";
  }

  return FALLBACK_HINT;
};

export const renderInlineFieldError = ({ message, hint }: InlineFieldErrorArgs): ReactNode => {
  if (!message) {
    return null;
  }

  const resolvedHint = hint ?? deriveHintFromMessage(message);

  return (
    <>
      <p className="form-error">{message}</p>
      <p className="form-hint">Hint: {resolvedHint}</p>
    </>
  );
};
