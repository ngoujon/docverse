import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, LogOut, Shield, Sparkles } from "lucide-react";
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
    <header className="flex items-center justify-between border-b border-surface-border px-4 py-3 sm:px-6">
      <Link to="/dashboard" className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
        <Sparkles size={18} className="text-accent" />
        <span className="font-mono text-sm font-bold uppercase tracking-widest">Open::Rag</span>
      </Link>

      <nav className="flex items-center gap-1 rounded-lg border border-surface-border p-1">
        <Link
          to="/dashboard"
          className={clsx(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
            active === "client" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400 hover:bg-surface-2"
          )}
        >
          <LayoutDashboard size={13} /> {t("dashboard.nav.workspace")}
        </Link>
        {user?.role === "admin" && (
          <Link
            to="/admin"
            className={clsx(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              active === "admin" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400 hover:bg-surface-2"
            )}
          >
            <Shield size={13} /> {t("dashboard.nav.admin")}
          </Link>
        )}
      </nav>

      <div className="flex items-center gap-2">
        <LanguageSwitcher variant="light" />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <span className="hidden text-sm text-slate-600 dark:text-slate-400 sm:inline">
          {user?.display_name || user?.email}
        </span>
        <button
          onClick={() => {
            logout();
            navigate("/");
          }}
          title={t("dashboard.nav.logout")}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-slate-500 hover:border-red-400 hover:text-red-500 dark:text-slate-400"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
