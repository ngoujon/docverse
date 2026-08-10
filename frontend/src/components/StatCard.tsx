import type { ReactNode } from "react";

export default function StatCard({
  icon,
  label,
  value,
  limit,
  used,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  /** When set alongside `used`, renders a small progress bar against this plan quota. */
  limit?: number | null;
  used?: number;
}) {
  const hasQuota = limit != null && used != null && limit > 0;
  const ratio = hasQuota ? Math.min(1, used! / limit!) : 0;
  const nearLimit = ratio >= 0.9;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {icon}
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
        {hasQuota && <span className="text-sm font-medium text-slate-400 dark:text-slate-500"> / {limit}</span>}
      </p>
      {hasQuota && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full ${nearLimit ? "bg-amber-500" : "bg-accent"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
