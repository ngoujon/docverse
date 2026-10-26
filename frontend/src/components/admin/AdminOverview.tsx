import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  Files,
  Folders,
  HardDrive,
  Inbox,
  Mail,
  MessageSquareText,
  Server,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import { formatBytes } from "../../utils/format";
import StatCard from "../ui/StatCard";
import { ProgressBar } from "../ui/controls";
import type { AdminHealth, AdminStats } from "../../types";

type Series = "users" | "questions" | "documents";
const SERIES: Series[] = ["users", "questions", "documents"];

const panel = "rounded-xl border border-surface-border bg-surface-1 p-5 shadow-card";
const panelTitle = "text-sm font-semibold text-slate-900 dark:text-slate-100";

/** KPI header of the admin dashboard: headline numbers with their 7-day
 * trend, a 30-day activity chart and the service / account health. */
export default function AdminOverview({ stats }: { stats: AdminStats }) {
  const { t, i18n } = useTranslation();
  const [series, setSeries] = useState<Series>("questions");
  const [health, setHealth] = useState<AdminHealth | null | "error">(null);

  useEffect(() => {
    api
      .adminHealth()
      .then(setHealth)
      .catch(() => setHealth("error"));
  }, []);

  const plus = (n: number) => (n > 0 ? t("admin.overview.last7d", { count: n }) : undefined);
  const pct = (n: number) => (stats.users > 0 ? n / stats.users : 0);

  const points = stats.daily ?? [];
  const values = points.map((p) => p[series]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Users size={14} />}
          label={t("admin.kpi.users")}
          value={stats.users}
          hint={plus(stats.new_users_7d)}
        />
        <StatCard icon={<Activity size={14} />} label={t("admin.overview.activeUsers")} value={stats.active_users_7d} />
        <StatCard
          icon={<MessageSquareText size={14} />}
          label={t("admin.overview.questions7d")}
          value={stats.questions_7d}
        />
        <StatCard
          icon={<Files size={14} />}
          label={t("admin.kpi.documents")}
          value={stats.documents}
          hint={plus(stats.new_documents_7d)}
        />
        <StatCard
          icon={<Folders size={14} />}
          label={t("admin.kpi.spaces")}
          value={stats.spaces}
          hint={plus(stats.new_spaces_7d)}
        />
        <StatCard
          icon={<HardDrive size={14} />}
          label={t("admin.kpi.storage")}
          value={formatBytes(stats.storage_bytes)}
        />
        <StatCard icon={<Mail size={14} />} label={t("admin.kpi.newsletter")} value={stats.newsletter_subscribers} />
        <StatCard icon={<Inbox size={14} />} label={t("admin.overview.contact7d")} value={stats.contact_messages_7d} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className={clsx(panel, "flex flex-col")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={panelTitle}>{t("admin.overview.activityTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t(`admin.overview.series.${series}`)} · {t("admin.overview.total30d", { count: total })}
              </p>
            </div>
            <div className="flex gap-1 rounded-full border border-surface-border p-1">
              {SERIES.map((key) => (
                <button
                  key={key}
                  onClick={() => setSeries(key)}
                  className={clsx(
                    "whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition",
                    series === key
                      ? "bg-slate-900 text-white dark:bg-accent"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                  )}
                >
                  {t(`admin.overview.series.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <div
            className="mt-6 flex min-h-40 flex-1 items-end gap-[3px]"
            role="img"
            aria-label={t("admin.overview.activityTitle")}
          >
            {points.map((p) => (
              <div
                key={p.date}
                title={`${day(p.date)} : ${p[series]}`}
                className="group flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className={clsx(
                    "w-full rounded-t-[3px] transition group-hover:bg-fluent-indigo",
                    p[series] > 0 ? "bg-fluent-indigo/70" : "bg-surface-3",
                  )}
                  style={{ height: p[series] > 0 ? `${Math.max(6, (p[series] / max) * 100)}%` : "3px" }}
                />
              </div>
            ))}
          </div>
          {points.length > 0 && (
            <div className="mt-2 flex justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>{day(points[0].date)}</span>
              <span>{t("admin.overview.max", { count: Math.max(...values) })}</span>
              <span>{day(points[points.length - 1].date)}</span>
            </div>
          )}
        </section>

        <div className="grid gap-4">
          <section className={panel}>
            <h2 className={clsx(panelTitle, "flex items-center gap-2")}>
              <Server size={15} className="text-fluent-indigo" /> {t("admin.overview.healthTitle")}
            </h2>
            {health === null ? (
              <p className="mt-3 text-sm text-slate-500">{t("common.loading")}</p>
            ) : (
              <dl className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">{t("admin.overview.ai")}</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                    <span
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        health !== "error" && health.llm_reachable ? "bg-emerald-500" : "bg-red-500",
                      )}
                    />
                    {health !== "error" && health.llm_reachable ? t("admin.overview.up") : t("admin.overview.down")}
                  </dd>
                </div>
                {health !== "error" && (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">{t("admin.overview.model")}</dt>
                      <dd className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                        {health.chat_model}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">{t("admin.overview.hosting")}</dt>
                      <dd className="truncate text-right text-slate-700 dark:text-slate-300">{health.hosting}</dd>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">{t("admin.overview.docErrors")}</dt>
                  <dd
                    className={clsx(
                      "flex items-center gap-1 font-medium",
                      stats.documents_in_error > 0 ? "text-amber-600" : "text-slate-900 dark:text-slate-100",
                    )}
                  >
                    {stats.documents_in_error > 0 && <AlertTriangle size={13} />}
                    {stats.documents_in_error}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          <section className={panel}>
            <h2 className={panelTitle}>{t("admin.overview.accountsTitle")}</h2>
            <div className="mt-3 space-y-3 text-sm">
              {[
                { label: t("admin.overview.verified"), n: stats.verified_users },
                { label: t("admin.overview.twoFactor"), n: stats.totp_users },
              ].map(({ label, n }) => (
                <div key={label}>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>{label}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {n} / {stats.users}
                    </span>
                  </div>
                  <ProgressBar ratio={pct(n)} warn={false} className="mt-1.5 h-1.5" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
