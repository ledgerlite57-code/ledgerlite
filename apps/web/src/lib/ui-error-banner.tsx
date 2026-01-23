import * as React from "react";
import { normalizeError } from "./errors";
import { Button } from "./ui-button";
import { cn } from "./utils";

type ErrorBannerProps = {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
};

export const ErrorBanner = ({ error, title = "Something went wrong", onRetry, className }: ErrorBannerProps) => {
  const { message, hint, isTransient } = normalizeError(error);

  return (
    <div className={cn("rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm", className)}>
      <div className="font-semibold">{title}</div>
      <div>{message}</div>
      {hint ? <div className="muted">Hint: {hint}</div> : null}
      {isTransient && onRetry ? (
        <div style={{ marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
};
