import Link from "next/link";
import { Button } from "../src/lib/ui-button";

export default function HomePage() {
  return (
    <div className="page">
      <header className="header">
        <strong>LedgerLite</strong>
        <Link href="/login">Login</Link>
      </header>
      <main className="content">
        <div className="card">
          <h1>Finance clarity without the busywork.</h1>
          <p className="muted">
            LedgerLite helps teams draft invoices, track bills, reconcile bank activity, and close faster with
            audit-ready reporting.
          </p>
          <div style={{ height: 16 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button asChild>
              <Link href="/login">Get started</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
