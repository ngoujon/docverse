/**
 * Small, style-only building blocks of the app UI (dashboard, workspace,
 * auth pages). The Tailwind class strings live here once instead of being
 * copy-pasted on every button, input and badge.
 */
import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import clsx from "clsx";

// --- Class names ----------------------------------------------------------------

/** Main call to action inside cards and modals. */
export const buttonPrimary =
  "rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none";
/** Full-width submit button of the auth forms. */
export const buttonPrimaryWide =
  "w-full rounded-lg bg-accent px-3 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none";
/** Outlined secondary action. */
export const buttonOutline =
  "rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3 disabled:opacity-40";
/** Text-only "Cancel"-style button. */
export const buttonGhost = "rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-surface-3";
/** Destructive confirmation. */
export const buttonDanger =
  "rounded-lg bg-red-600 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-red-500";

/** Standard text input / select / textarea. */
export const inputClass =
  "w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent";
const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

// --- Form fields -----------------------------------------------------------------

/** Label stacked above its control. */
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

/** Password input with a show/hide toggle; `onEnter` submits the form. */
export function PasswordInput({
  value,
  onChange,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        className={`${inputClass} pr-9`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
        tabIndex={-1}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// --- Indicators ----------------------------------------------------------------------

const BADGE_TONES = {
  accent: "bg-accent/15 text-accent",
  muted: "bg-surface-3 text-slate-600 dark:text-slate-300",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  danger: "bg-red-500/15 text-red-600 dark:text-red-400",
};

/** Small uppercase pill (role, status...). An icon makes it a flex row. */
export function Badge({
  tone = "muted",
  icon,
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        icon !== undefined && "flex items-center gap-1",
        BADGE_TONES[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Usage bar against a quota; turns amber from 90% when `warn` is set. */
export function ProgressBar({
  ratio,
  warn = true,
  className = "mt-2 h-1",
}: {
  ratio: number;
  warn?: boolean;
  /** Spacing and height of the track. */
  className?: string;
}) {
  const clamped = Math.min(1, ratio);
  return (
    <div className={`w-full overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <div
        className={clsx("h-full rounded-full", warn && clamped >= 0.9 ? "bg-amber-500" : "bg-accent")}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

// --- Buttons ------------------------------------------------------------------------------

/** Square icon-only action (table rows, toolbars). */
export function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "rounded-md p-1.5 disabled:opacity-30",
        danger ? "text-red-500 hover:bg-red-500/10" : "text-slate-500 dark:text-slate-400 hover:bg-surface-3",
      )}
    >
      {children}
    </button>
  );
}
