import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardCheck, Receipt, Wallet } from "lucide-react";
import { Button } from "../src/lib/ui-button";

export default function HomePage() {
  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <strong className="landing-wordmark">LedgerLite</strong>
        <Link href="/login" className="landing-link">
          Sign in
        </Link>
      </header>
      <main className="landing-main">
        <section className="landing-hero">
          <p className="landing-kicker">Business accounting without the complexity</p>
          <h1>Simple Accounting. Clear Numbers. Full Control.</h1>
          <p className="muted landing-subtitle">
            Manage invoices, bills, expenses, and tax-ready reports from one workspace built for real business teams,
            not accountants only.
          </p>
          <div className="landing-actions">
            <Button asChild>
              <Link href="/signup">
                Create Free Account <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <div className="landing-metrics">
            <div className="landing-metric">
              <strong>Who it is for</strong>
              <span className="muted">Founders, accountants, and operations teams.</span>
            </div>
            <div className="landing-metric">
              <strong>What it solves</strong>
              <span className="muted">Daily bookkeeping, billing, and reporting in one flow.</span>
            </div>
            <div className="landing-metric">
              <strong>Why teams choose it</strong>
              <span className="muted">Fast onboarding, clear dashboards, and clean audit trails.</span>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <h2>Features in plain language</h2>
          <p className="muted">Everything you need to stay in control of business finances, without jargon.</p>
          <div className="landing-grid">
            <article className="landing-feature">
              <Receipt className="landing-feature-icon" />
              <h3>Invoices & Bills</h3>
              <p className="muted">Create, send, and track what you charge and what you owe.</p>
            </article>
            <article className="landing-feature">
              <Wallet className="landing-feature-icon" />
              <h3>Expenses</h3>
              <p className="muted">See where your money goes and keep costs visible.</p>
            </article>
            <article className="landing-feature">
              <BarChart3 className="landing-feature-icon" />
              <h3>Reports</h3>
              <p className="muted">View profit, loss, aging, and tax summaries instantly.</p>
            </article>
            <article className="landing-feature">
              <ClipboardCheck className="landing-feature-icon" />
              <h3>Audit-Ready</h3>
              <p className="muted">Keep records clean with traceable, compliant workflows.</p>
            </article>
          </div>
        </section>

        <section className="landing-section">
          <h2>Built for growing teams</h2>
          <div className="landing-audience">
            <div className="landing-audience-item">Founders who need clarity at a glance</div>
            <div className="landing-audience-item">Finance teams handling invoicing and compliance</div>
            <div className="landing-audience-item">Operations teams managing day-to-day entries</div>
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <h2>Start in minutes</h2>
            <p className="muted">No credit card required. You can add company details after signup.</p>
          </div>
          <Button asChild>
            <Link href="/signup">Get Started</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
