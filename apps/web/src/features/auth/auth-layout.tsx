import type { ReactNode } from "react";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="onboarding-shell">
      <div className="onboarding-main">
        <div className="card onboarding-card">
          <div className="onboarding-header">
            <p className="onboarding-eyebrow">LedgerLite</p>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? (
            <>
              <div style={{ height: 12 }} />
              {footer}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
