import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Files,
  Folders,
  HardDrive,
  Mail,
  MessagesSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "../api/client";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatBytes } from "../utils/format";
import DashboardNav from "../components/DashboardNav";
import StatCard from "../components/StatCard";
import type { AdminStats, Space, User } from "../types";

function relativeDate(iso: string): string {
  return new Date(iso + "Z").toLocaleDateString();
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  usePageTitle(`${t("dashboard.nav.admin")} - Open RAG`);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "spaces">("users");

  useEffect(() => {
    Promise.all([api.adminStats(), api.adminUsers(), api.adminSpaces()])
      .then(([st, u, s]) => {
        setStats(st);
        setUsers(u);
        setSpaces(s);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[100dvh] bg-surface-0">
      <DashboardNav active="admin" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t("admin.title")}</h1>

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Users size={14} />} label={t("admin.kpi.users")} value={stats.users} />
            <StatCard icon={<Folders size={14} />} label={t("admin.kpi.spaces")} value={stats.spaces} />
            <StatCard icon={<Files size={14} />} label={t("admin.kpi.documents")} value={stats.documents} />
            <StatCard icon={<MessagesSquare size={14} />} label={t("admin.kpi.messages")} value={stats.messages} />
            <StatCard icon={<HardDrive size={14} />} label={t("admin.kpi.storage")} value={formatBytes(stats.storage_bytes)} />
            <StatCard icon={<Mail size={14} />} label={t("admin.kpi.newsletter")} value={stats.newsletter_subscribers} />
            <StatCard icon={<TrendingUp size={14} />} label={t("admin.kpi.newUsers7d")} value={stats.new_users_7d} />
            <StatCard icon={<TrendingUp size={14} />} label={t("admin.kpi.newSpaces7d")} value={stats.new_spaces_7d} />
          </div>
        )}

        <div className="mt-8 flex gap-1 rounded-lg border border-surface-border p-1 w-fit">
          <button
            onClick={() => setTab("users")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "users" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("admin.tabs.users")}
          </button>
          <button
            onClick={() => setTab("spaces")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "spaces" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("admin.tabs.spaces")}
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
        ) : tab === "users" ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">{t("admin.table.email")}</th>
                  <th className="px-4 py-2.5">{t("admin.table.displayName")}</th>
                  <th className="px-4 py-2.5">{t("admin.table.role")}</th>
                  <th className="px-4 py-2.5">{t("admin.table.createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-surface-border">
                    <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{u.email}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{u.display_name || "-"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                          u.role === "admin" ? "bg-accent/15 text-accent" : "bg-surface-3 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{relativeDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">{t("admin.table.name")}</th>
                  <th className="px-4 py-2.5">{t("admin.table.documents")}</th>
                  <th className="px-4 py-2.5">{t("admin.table.conversations")}</th>
                  <th className="px-4 py-2.5">{t("admin.table.createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((s) => (
                  <tr key={s.id} className="border-t border-surface-border">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.document_count}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.conversation_count}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{relativeDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
