import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "./ui-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui-sheet";

type HelpDrawerProps = {
  title: string;
  summary: string;
  children: ReactNode;
  buttonLabel?: string;
};

export function HelpDrawer({ title, summary, children, buttonLabel = "Help" }: HelpDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary">
          <CircleHelp className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <p className="muted" style={{ marginTop: 8 }}>
          {summary}
        </p>
        <div className="help-drawer-content">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

type HelpSectionProps = {
  label: string;
  children: ReactNode;
};

export function HelpSection({ label, children }: HelpSectionProps) {
  return (
    <section className="help-section">
      <h3>{label}</h3>
      <div>{children}</div>
    </section>
  );
}

type TermHintProps = {
  term: string;
  hint: string;
};

export function TermHint({ term, hint }: TermHintProps) {
  return (
    <span className="term-hint" title={hint} aria-label={`${term}. ${hint}`}>
      {term}
    </span>
  );
}
