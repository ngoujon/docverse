/** Shared layout pieces of the account settings cards. */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export const cardClass = "rounded-xl border border-surface-border bg-surface-1 p-5 shadow-card";
export const input =
  "w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 shadow-card dark:text-slate-100 outline-none focus:border-accent focus:shadow-focus";
export const smallPrimary =
  "whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-hover";
const wideButton = "flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-40";
const cancelButton = "rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-surface-3";
export const muted = "text-xs text-slate-500 dark:text-slate-400";
export const iconMuted = "text-slate-500 dark:text-slate-400";

export function SectionTitle({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <h2
      className={`mt-10 text-base font-semibold tracking-tight ${
        danger ? "text-red-600" : "text-slate-900 dark:text-slate-100"
      }`}
    >
      {children}
    </h2>
  );
}

/** Card header: icon + label on the left, an optional action on the right. */
export function CardRow({
  icon,
  label,
  action,
  className = "",
}: {
  icon: ReactNode;
  label: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    // Wraps on narrow screens: the action drops under its label rather than
    // squeezing both onto two-line columns.
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        {typeof label === "string" ? (
          <span className="text-sm text-slate-800 dark:text-slate-200">{label}</span>
        ) : (
          label
        )}
      </div>
      {action}
    </div>
  );
}

/** Green success / red error line under a form. */
export function Feedback({ ok, text, className = "mt-1.5" }: { ok: boolean; text: string; className?: string }) {
  return (
    <p className={`${className} text-xs ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{text}</p>
  );
}

/** "Confirm / Cancel" buttons at the bottom of an inline form. */
export function FormButtons({
  label,
  onSubmit,
  onCancel,
  disabled,
  danger,
}: {
  label: string;
  onSubmit: () => void;
  onCancel: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <button
        onClick={onSubmit}
        disabled={disabled}
        className={`${wideButton} ${danger ? "bg-red-600 hover:bg-red-500" : "bg-accent hover:bg-accent-hover"}`}
      >
        {label}
      </button>
      <button onClick={onCancel} className={cancelButton}>
        {t("common.cancel")}
      </button>
    </div>
  );
}
