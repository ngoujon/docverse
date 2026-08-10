import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import ThemeToggle from "./ThemeToggle";

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-surface-0 px-4 py-10">
      <Link
        to="/"
        className="absolute left-4 top-4 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-500 hover:text-accent dark:text-slate-400"
      >
        <ArrowLeft size={14} /> {t("common.backHome")}
      </Link>
      <div className="absolute right-4 top-4">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-slate-900 dark:text-slate-100">
          <Sparkles size={18} className="text-accent" />
          <span className="font-mono text-sm font-bold uppercase tracking-widest">Open::Rag</span>
        </Link>

        <div className="rounded-xl border border-surface-border bg-surface-1 p-6 shadow-panel">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">{footer}</div>}
      </div>
    </div>
  );
}
