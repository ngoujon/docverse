import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, LogOut, Settings, Shield, Sparkles } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitcher from "./LanguageSwitcher";

export default function DashboardNav({ active }: { active: "client" | "admin" }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-surface-border px-3 py-3 sm:px-6">
      <Link to="/dashboard" className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
        <Sparkles size={18} className="text-accent" />
        <span className="hidden font-mono text-sm font-bold uppercase tracking-widest sm:inline">Doc::Verse</span>
      </Link>

      <nav className="order-3 flex w-full items-center justify-center gap-1 rounded-lg border border-surface-border p-1 sm:order-none sm:w-auto">
        <Link
          to="/dashboard"
          className={clsx(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            active === "client" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400 hover:bg-surface-2"
          )}
        >
          <LayoutDashboard size={13} /> <span className="hidden sm:inline">{t("dashboard.nav.workspace")}</span>
        </Link>
        {user?.role === "admin" && (
          <Link
            to="/admin"
            className={clsx(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              active === "admin" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400 hover:bg-surface-2"
            )}
          >
            <Shield size={13} /> <span className="hidden sm:inline">{t("dashboard.nav.admin")}</span>
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
