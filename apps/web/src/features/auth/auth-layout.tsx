import type { ReactNode } from "react";
import { AppLogo } from "../../lib/logo-mark";
import { ThemeToggle } from "../../lib/theme-toggle";

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
        <div className="auth-shell-topbar">
          <AppLogo compactWordmark />
          <ThemeToggle />
        </div>
        <div className="card onboarding-card">
          <div className="onboarding-header">
            <p className="onboarding-eyebrow">Welcome</p>
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
