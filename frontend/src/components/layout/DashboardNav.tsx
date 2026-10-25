import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, LogOut, Settings, Shield } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import ThemeToggle from "../ui/ThemeToggle";
import BrandLogo from "../ui/BrandLogo";
import LanguageSwitcher from "../ui/LanguageSwitcher";

const tabClass = (isActive: boolean) =>
  clsx(
    "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition sm:flex-none",
    isActive
      ? "bg-slate-900 text-white dark:bg-accent"
      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100",
  );

/** Top bar of the dashboard, admin and account pages. */
export default function DashboardNav({ active }: { active: "client" | "admin" }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-surface-border bg-surface-1 px-3 py-3 sm:px-6">
      <Link to="/dashboard" className="text-slate-900 dark:text-slate-100">
        <BrandLogo className="!text-lg" hideNameOnMobile />
      </Link>

      <nav className="order-3 flex w-full items-center justify-center gap-1 rounded-full border border-surface-border bg-surface-1 p-1 sm:order-none sm:w-auto">
        <Link to="/dashboard" className={tabClass(active === "client")}>
          <LayoutDashboard size={14} /> <span>{t("dashboard.nav.workspace")}</span>
        </Link>
        {user?.role === "admin" && (
          <Link to="/admin" className={tabClass(active === "admin")}>
            <Shield size={14} /> <span>{t("dashboard.nav.admin")}</span>
          </Link>
        )}
      </nav>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <LanguageSwitcher variant="light" />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <span className="hidden text-sm text-slate-600 dark:text-slate-400 lg:inline">
          {user?.display_name || user?.email}
        </span>
        <Link
          to="/account"
          title={t("auth.account.title")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border text-slate-500 hover:border-accent hover:text-accent dark:text-slate-400"
        >
          <Settings size={14} />
        </Link>
        <button
          onClick={() => {
            logout();
            navigate("/");
          }}
          title={t("dashboard.nav.logout")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-surface-border text-slate-500 hover:border-red-400 hover:text-red-500 dark:text-slate-400"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
