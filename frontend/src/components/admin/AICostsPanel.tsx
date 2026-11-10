import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";
import { api } from "../../api/client";
import { formatCount, formatUsd } from "../../utils/format";
import type { AdminAICosts } from "../../types";

const panel = "rounded-xl border border-surface-border bg-surface-1 p-5 shadow-card";

/** What the platform's Mistral key costs: headline amounts, a 30-day
 * chart, the cost per step / model and the biggest consumers - plus the
 * volume already carried by users' own keys. */
export default function AICostsPanel() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<AdminAICosts | null | "error">(null);
  const lang = i18n.language;

  useEffect(() => {
    api
      .adminAICosts(30)
      .then(setData)
      .catch(() => setData("error"));
  }, []);

  if (data === null) return null;
  if (data === "error") {
    return <section className={panel}><p className="text-sm text-red-500">{t("admin.aiCosts.error")}</p></section>;
  }

  const max = Math.max(0.000001, ...data.series.map((p) => p.cost_usd));
  const tiles = [
    { label: t("admin.aiCosts.today"), value: formatUsd(data.today.cost_usd, lang) },
    { label: t("admin.aiCosts.month"), value: formatUsd(data.month.cost_usd, lang) },
    { label: t("admin.aiCosts.last30d"), value: formatUsd(data.last_30d.cost_usd, lang) },
    { label: t("admin.aiCosts.perQuestion"), value: formatUsd(data.cost_per_question_usd, lang) },
    { label: t("admin.aiCosts.ownKeyUsers"), value: formatCount(data.own_key_users, lang) },
    { label: t("admin.aiCosts.ownKeyVolume"), value: formatUsd(data.own_key_last_30d.cost_usd, lang) },
  ];

  return (
    <section className={panel}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Coins size={15} className="text-fluent-indigo" /> {t("admin.aiCosts.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("admin.aiCosts.subtitle")}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-surface-2 p-3">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{tile.value}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex h-24 items-end gap-[3px]" role="img" aria-label={t("admin.aiCosts.chart")}>
        {data.series.map((p) => (
          <div
            key={p.date}
            title={`${p.date} : ${formatUsd(p.cost_usd, lang)}`}
            className={p.cost_usd > 0 ? "flex-1 rounded-t-[3px] bg-fluent-indigo/70" : "flex-1 rounded-t-[3px] bg-surface-3"}
            style={{ height: p.cost_usd > 0 ? `${Math.max(6, (p.cost_usd / max) * 100)}%` : "3px" }}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("admin.aiCosts.byKind")}</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {data.by_kind.length === 0 && <li>{t("admin.aiCosts.empty")}</li>}
            {data.by_kind.map((k) => (
              <li key={`${k.kind}-${k.model}`} className="flex justify-between gap-2">
                <span className="truncate">
                  {t(`app.usage.kinds.${k.kind}`, { defaultValue: k.label })}{" "}
                  <span className="font-mono text-[10px] text-slate-400">{k.model}</span>
                </span>
                <span className="shrink-0">
                  {k.pages ? t("app.usage.pages", { count: k.pages }) : `${formatCount(k.tokens, lang)} tokens`} ·{" "}
                  {formatUsd(k.cost_usd, lang)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t("admin.aiCosts.topUsers")}</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {data.top_users.length === 0 && <li>{t("admin.aiCosts.empty")}</li>}
            {data.top_users.map((u) => (
              <li key={u.email} className="flex justify-between gap-2">
                <span className="truncate">{u.email}</span>
                <span className="shrink-0">{formatUsd(u.cost_usd, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-slate-400">{t("admin.aiCosts.note")}</p>
    </section>
  );
}
