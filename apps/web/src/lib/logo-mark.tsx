import { useId } from "react";
import { cn } from "./utils";

type AppLogoProps = {
  className?: string;
  showWordmark?: boolean;
  compactWordmark?: boolean;
};

export function AppLogo({ className, showWordmark = true, compactWordmark = false }: AppLogoProps) {
  const gradientId = useId();
  return (
    <span className={cn("app-logo", className)}>
      <svg viewBox="0 0 120 120" role="img" aria-label="LedgerLite logo" className="app-logo-mark">
        <defs>
          <linearGradient id={gradientId} x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="108" height="108" rx="28" fill="#071124" />
        <path
          d="M30 83V35h35c13 0 20 7 20 18 0 8-4 13-11 16l13 14H74L63 71H47v12H30zm17-27h17c5 0 8-2 8-6 0-4-3-6-8-6H47v12z"
          fill={`url(#${gradientId})`}
        />
      </svg>
      {showWordmark ? (
        <span className="app-logo-wordmark" data-compact={compactWordmark ? "true" : "false"}>
          LedgerLite
        </span>
      ) : null}
    </span>
  );
}
