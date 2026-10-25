import type { ReactNode } from "react";
import { ProgressBar } from "./controls";

/** Dashboard KPI tile, optionally with a usage bar against a quota.
 * Icon, then the value, then the label - so labels that wrap onto two
 * lines never push the values out of alignment across the row. */
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

  return (
    <div className="flex flex-col rounded-xl border border-surface-border bg-surface-1 p-4 shadow-card sm:p-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo dark:bg-accent/20 dark:text-[#d6d4ff]">
        {icon}
      </span>
      <p className="mt-3 text-2xl font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100">
        {value}
        {hasQuota && <span className="text-sm font-medium text-slate-400 dark:text-slate-500"> / {limit}</span>}
      </p>
      <p className="mt-1.5 text-sm leading-snug text-slate-500 dark:text-slate-400">{label}</p>
      {hasQuota && <ProgressBar ratio={used / limit} className="mt-auto h-1 pt-0 [margin-top:0.75rem]" />}
    </div>
  );
}
