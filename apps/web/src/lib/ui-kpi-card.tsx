import { cn } from "./utils";

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  className?: string;
};

export const KpiCard = ({ label, value, hint, className }: KpiCardProps) => {
  return (
    <div className={cn("card", className)}>
      <p className="muted">{label}</p>
      <div className="text-2xl font-semibold">{value}</div>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  );
};
