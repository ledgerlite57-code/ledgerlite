import type { ReactNode } from "react";
import { Breadcrumbs } from "./ui-breadcrumbs";
import { cn } from "./utils";

type PageHeaderProps = {
  title: string;
  heading?: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, heading, description, meta, actions, icon, className }: PageHeaderProps) => {
  const headingText = heading ?? title;
  const showEyebrow = Boolean(heading && heading !== title);
  const fallbackIcon = title ? title.trim().charAt(0).toUpperCase() : "?";

  return (
    <div className={cn("page-header", className)}>
      <div className="page-header-main">
        <Breadcrumbs />
        <div className="page-header-row">
          <div className="page-header-icon" aria-hidden="true">
            {icon ?? <span>{fallbackIcon}</span>}
          </div>
          <div className="page-header-content">
            {showEyebrow ? <div className="page-header-title">{title}</div> : null}
            <h1 className="page-header-heading">{headingText}</h1>
            {description ? <p className="muted">{description}</p> : null}
            {meta}
          </div>
        </div>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
};
