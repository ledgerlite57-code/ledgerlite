import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={className ?? "empty-state"}>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  );
}
