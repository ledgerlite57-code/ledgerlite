import Link from "next/link";
import { ArrowRight, BarChart3, Receipt, ShieldCheck, Wallet } from "lucide-react";
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
          <div className="landing-hero-copy">
            <p className="landing-kicker">Business accounting without complexity</p>
            <h1>Simple Accounting. Clear Numbers. Full Control.</h1>
            <p className="landing-muted landing-subtitle">
              Manage invoices, bills, expenses, and tax-ready reports from one workspace built for founders, finance,
              and operations teams.
            </p>
            <div className="landing-actions">
              <Button asChild className="landing-primary-cta">
                <Link href="/signup">
                  Create Free Account <ArrowRight size={16} />
                </Link>
              </Button>
              <Button asChild variant="secondary" className="landing-secondary-cta">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <p className="landing-muted landing-trust-line">No credit card required • You can add company details later</p>
          </div>
          <div className="landing-hero-panel">
            <p className="landing-panel-label">Today at a glance</p>
            <div className="landing-panel-stat">
              <span className="landing-muted">Open receivables</span>
              <strong>$86,420</strong>
            </div>
            <div className="landing-panel-stat">
              <span className="landing-muted">Pending bills</span>
              <strong>$14,090</strong>
            </div>
            <div className="landing-panel-stat">
              <span className="landing-muted">VAT due this month</span>
              <strong>$3,210</strong>
            </div>
            <div className="landing-panel-bars" aria-hidden="true">
              <span style={{ width: "78%" }} />
              <span style={{ width: "52%" }} />
              <span style={{ width: "64%" }} />
            </div>
          </div>
        </section>

        <section className="landing-section">
          <h2>Clarity for every role</h2>
          <div className="landing-metrics">
            <div className="landing-metric">
              <strong>Founders</strong>
              <span className="landing-muted">See cash movement and profit instantly.</span>
            </div>
            <div className="landing-metric">
              <strong>Finance teams</strong>
              <span className="landing-muted">Run invoicing, billing, and reconciliation faster.</span>
            </div>
            <div className="landing-metric">
              <strong>Operations</strong>
              <span className="landing-muted">Keep day-to-day entries clean and traceable.</span>
            </div>
          </div>
        </section>

        <section className="landing-section">
          <h2>Features in plain language</h2>
          <p className="landing-muted">Everything you need to stay in control of business finances, without jargon.</p>
          <div className="landing-grid">
            <article className="landing-feature">
              <Receipt className="landing-feature-icon" />
              <h3>Invoices & Bills</h3>
              <p className="landing-muted">Create, send, and track what you charge and what you owe.</p>
            </article>
            <article className="landing-feature">
              <Wallet className="landing-feature-icon" />
              <h3>Expenses</h3>
              <p className="landing-muted">See where your money goes and keep costs visible.</p>
            </article>
            <article className="landing-feature">
              <BarChart3 className="landing-feature-icon" />
              <h3>Reports</h3>
              <p className="landing-muted">View profit, loss, aging, and tax summaries instantly.</p>
            </article>
            <article className="landing-feature">
              <ShieldCheck className="landing-feature-icon" />
              <h3>Audit-Ready</h3>
              <p className="landing-muted">Keep records clean with traceable, compliant workflows.</p>
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
            <p className="landing-muted">No credit card required. Secure signup with guided onboarding.</p>
          </div>
          <Button asChild className="landing-primary-cta">
            <Link href="/signup">Get Started</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
