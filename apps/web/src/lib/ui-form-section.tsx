import type { ReactNode } from "react";
import { cn } from "./utils";

type FormSectionProps = {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  hasError?: boolean;
  className?: string;
};

export const FormSection = ({
  id,
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
  hasError = false,
  className,
}: FormSectionProps) => {
  if (collapsible) {
    return (
      <details id={id} className={cn("form-section", className)} open={defaultOpen}>
        <summary className={cn("form-section-summary", hasError && "has-error")}>
          <span>{title}</span>
          {hasError ? <span className="form-section-error">Needs attention</span> : null}
        </summary>
        {description ? <p className="muted">{description}</p> : null}
        <div className="form-section-body">{children}</div>
      </details>
    );
  }

  return (
    <section id={id} className={cn("form-section", className)}>
      <div className="form-section-title">
        <h3>{title}</h3>
        {hasError ? <span className="form-section-error">Needs attention</span> : null}
      </div>
      {description ? <p className="muted">{description}</p> : null}
      <div className="form-section-body">{children}</div>
    </section>
  );
};
