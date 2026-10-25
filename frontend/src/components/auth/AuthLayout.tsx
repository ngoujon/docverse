import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import ThemeToggle from "../ui/ThemeToggle";
import BrandLogo from "../ui/BrandLogo";
import LegalFooterLinks from "../layout/LegalFooterLinks";

/** Centered card layout shared by every authentication / account page. */
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
    <div className="flex min-h-[100dvh] w-full flex-col bg-surface-0">
      {/* Top bar: brand on the left, way back + theme on the right. */}
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" aria-label={t("common.backHome")} className="text-slate-900 dark:text-slate-100">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:text-accent dark:text-slate-400 sm:flex"
          >
            <ArrowLeft size={14} /> {t("common.backHome")}
          </Link>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px] overflow-hidden rounded-xl border border-surface-border bg-surface-1 shadow-card-lg">
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {/* "No account yet? / Already registered?" switch, attached to
              the card so it reads as part of the same form. */}
          {footer && (
            <div className="border-t border-surface-border bg-surface-2 px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400 sm:px-8">
              {footer}
            </div>
          )}
        </div>
      </main>

      {/* Bottom padding on mobile keeps the links clear of the help button. */}
      <LegalFooterLinks className="px-4 pb-20 pt-2 sm:pb-6" />
    </div>
  );
}

/** Outcome of a page opened from an emailed link (verification, newsletter
 * confirmation...): a spinner text, then a success or error message. */
export function TokenStatus({
  status,
  loadingText,
  successText,
  errorText,
  successAction,
}: {
  status: "loading" | "ok" | "error";
  loadingText: string;
  successText: string;
  errorText: string;
  successAction?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      {status === "loading" && <p className="text-sm text-slate-500 dark:text-slate-400">{loadingText}</p>}
      {status === "ok" && (
        <>
          <CheckCircle2 size={28} className="text-emerald-500" />
          <p className="text-sm text-slate-600 dark:text-slate-400">{successText}</p>
          {successAction}
        </>
      )}
      {status === "error" && (
        <>
          <XCircle size={28} className="text-red-500" />
          <p className="text-sm text-slate-600 dark:text-slate-400">{errorText}</p>
        </>
      )}
      <Link to="/" className="mt-2 text-sm font-medium text-accent hover:underline">
        {t("newsletter.backHome")}
      </Link>
    </div>
  );
}
