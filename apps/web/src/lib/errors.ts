export type NormalizedError = {
  message: string;
  hint?: string;
  isTransient: boolean;
};

export const normalizeError = (error: unknown): NormalizedError => {
  let message = "Something went wrong.";
  let hint: string | undefined;
  let isTransient = false;

  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message || message;
  } else if (typeof error === "object" && error) {
    const maybeError = error as { message?: string; hint?: string };
    if (maybeError.message) {
      message = String(maybeError.message);
    }
    if (maybeError.hint) {
      hint = String(maybeError.hint);
    }
  }

  const lower = message.toLowerCase();
  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("timeout") ||
    lower.includes("temporar")
  ) {
    isTransient = true;
    if (!hint) {
      hint = "Check your connection and try again.";
    }
  }

  if (!hint && message === "Request failed") {
    hint = "Please try again. If this keeps happening, contact support.";
  }

  return { message, hint, isTransient };
};
