import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, MoveRight } from "lucide-react";
import { cn } from "./utils";

type KpiTrend = {
  direction: "up" | "down" | "flat";
  label: string;
};

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  trend?: KpiTrend;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
};

const trendIcon = (direction: KpiTrend["direction"]) => {
  if (direction === "up") {
    return <ArrowUpRight className="h-4 w-4" />;
  }
  if (direction === "down") {
    return <ArrowDownRight className="h-4 w-4" />;
  }
  return <Minus className="h-4 w-4" />;
};

export const KpiCard = ({ label, value, hint, trend, icon, href, className }: KpiCardProps) => {
  const body = (
    <div className={cn("kpi-card", className)}>
      <div className="kpi-card-header">
        <div className="kpi-card-icon">{icon ?? <MoveRight className="h-4 w-4" />}</div>
        <p className="kpi-card-label">{label}</p>
      </div>
      <div className="kpi-card-value">{value}</div>
      {trend ? (
        <div className={cn("kpi-card-trend", trend.direction)}>
          {trendIcon(trend.direction)}
          <span>{trend.label}</span>
        </div>
      ) : hint ? (
        <p className="muted">{hint}</p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="kpi-card-link">
        {body}
      </Link>
    );
  }

  return body;
};
