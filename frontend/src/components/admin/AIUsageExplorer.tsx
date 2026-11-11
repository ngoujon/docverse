import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LineChart } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import { formatCount, formatUsd } from "../../utils/format";
import type { AdminUsageExplorer, UsageExplorerFilters, UsageExplorerPoint } from "../../types";

const panel = "rounded-xl border border-surface-border bg-surface-1 p-5 shadow-card";
const select =
  "rounded-lg border border-surface-border bg-surface-1 px-2 py-1 text-xs text-slate-700 shadow-card outline-none focus:border-accent dark:text-slate-300";

type Metric = "cost_usd" | "calls" | "questions" | "users" | "tokens";
const METRICS: Metric[] = ["cost_usd", "calls", "questions", "users", "tokens"];
const PERIODS = [1, 7, 30, 90];

/** Each model family keeps the same color whatever the filters (color
 * follows the entity, never its rank). The order is the validated
 * colorblind-safe one, so the most common families sit side by side. */
const FAMILY_COLOR: Record<string, string> = {
  large: "var(--viz-1)",
  small: "var(--viz-2)",
  "ministral-8b": "var(--viz-3)",
  medium: "var(--viz-4)",
  embed: "var(--viz-5)",
  ocr: "var(--viz-6)",
  "ministral-14b": "var(--viz-7)",
  "ministral-3b": "var(--viz-8)",
};
const FAMILY_ORDER = Object.keys(FAMILY_COLOR);

const value = (p: UsageExplorerPoint, m: Metric) => (m === "tokens" ? p.prompt_tokens + p.completion_tokens : p[m]);

/** Admin usage explorer: activity / cost curves with filters (period,
 * granularity, key, step, model, account), a weekday x hour heatmap to see
 * the peaks, and the cost per model from Mistral's token price grid. */
export default function AIUsageExplorer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filters, setFilters] = useState<UsageExplorerFilters>({
    days: 30,
    granularity: "day",
    key: "platform",
    kind: "",
    family: "",
    userId: "",
  });
  const [metric, setMetric] = useState<Metric>("cost_usd");
  const [data, setData] = useState<AdminUsageExplorer | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [heatHover, setHeatHover] = useState<[number, number] | null>(null);

  useEffect(() => {
    let alive = true;
    setError(false);
    api
      .adminAIUsage(filters)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [filters]);

  const set = <K extends keyof UsageExplorerFilters>(k: K, v: UsageExplorerFilters[K]) =>
    setFilters((f) => {
      const next = { ...f, [k]: v };
      // The hourly view is capped at 14 days server-side.
      if (k === "days" && (v as number) > 14 && next.granularity === "hour") next.granularity = "day";
      if (k === "days" && (v as number) <= 2) next.granularity = "hour";
      return next;
    });

  const fmt = (m: Metric, v: number) => (m === "cost_usd" ? formatUsd(v, lang) : formatCount(v, lang));
  const label = (iso: string, g = data?.granularity) => {
    const d = new Date(iso);
    if (g === "hour")
      return d.toLocaleString(lang, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const day = d.toLocaleDateString(lang, { day: "numeric", month: "short" });
    return g === "week" ? t("admin.usageExplorer.weekOf", { day }) : day;
  };
  const familyName = (f: string) => (f === "ocr" ? "OCR" : f === "embed" ? "Embed" : `Mistral ${f}`);

  const series = useMemo(() => data?.series ?? [], [data]);
  const stacked = metric === "cost_usd";
  const presentFamilies = useMemo(() => {
    const seen = new Set<string>();
    series.forEach((p) => Object.keys(p.cost_by_model).forEach((f) => seen.add(f)));
    return FAMILY_ORDER.filter((f) => seen.has(f)).concat([...seen].filter((f) => !FAMILY_ORDER.includes(f)));
  }, [series]);
  const max = Math.max(...series.map((p) => value(p, metric)), metric === "cost_usd" ? 0.000001 : 1);
  const peakIdx = series.reduce((best, p, i) => (value(p, metric) > value(series[best], metric) ? i : best), 0);
  const heatMax = Math.max(1, ...(data?.heatmap.flat().map((c) => c.calls) ?? [0]));

  const totals = data?.totals;
  const tiles = totals
    ? [
        { label: t("admin.usageExplorer.cost"), value: formatUsd(totals.cost_usd, lang) },
        {
          label: t("admin.usageExplorer.projection"),
          value: formatUsd((totals.cost_usd / filters.days) * 30, lang),
        },
        {
          label: t("admin.usageExplorer.perQuestion"),
          value: totals.questions ? formatUsd(totals.cost_usd / totals.questions, lang) : "-",
        },
        { label: t("admin.usageExplorer.metrics.questions"), value: formatCount(totals.questions, lang) },
        { label: t("admin.usageExplorer.metrics.users"), value: formatCount(totals.users, lang) },
        { label: t("admin.usageExplorer.metrics.calls"), value: formatCount(totals.calls, lang) },
      ]
    : [];

  const days = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    // 2024-01-01 was a Monday: index 0 = Monday, like Python's weekday().
    new Date(Date.UTC(2024, 0, 1 + d)).toLocaleDateString(lang, { weekday: "short", timeZone: "UTC" }),
  );
  const hovered = hover !== null ? series[hover] : null;

  return (
    <section className={panel}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <LineChart size={15} className="text-fluent-indigo" /> {t("admin.usageExplorer.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("admin.usageExplorer.subtitle")}</p>

      {/* Filters: one row above every chart. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full border border-surface-border p-1">
          {PERIODS.map((d) => (
            <button
              key={d}
              onClick={() => set("days", d)}
              className={clsx(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition",
                filters.days === d
                  ? "bg-slate-900 text-white dark:bg-accent"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
              )}
            >
              {t("admin.usageExplorer.days", { count: d })}
            </button>
          ))}
        </div>
        <select
          aria-label={t("admin.usageExplorer.granularity")}
          className={select}
          value={filters.granularity}
          onChange={(e) => set("granularity", e.target.value as UsageExplorerFilters["granularity"])}
        >
          <option value="hour" disabled={filters.days > 14}>
            {t("admin.usageExplorer.byHour")}
          </option>
          <option value="day">{t("admin.usageExplorer.byDay")}</option>
          <option value="week">{t("admin.usageExplorer.byWeek")}</option>
        </select>
        <select
          aria-label={t("admin.usageExplorer.key")}
          className={select}
          value={filters.key}
          onChange={(e) => set("key", e.target.value as UsageExplorerFilters["key"])}
        >
          <option value="platform">{t("admin.usageExplorer.keys.platform")}</option>
          <option value="own">{t("admin.usageExplorer.keys.own")}</option>
          <option value="all">{t("admin.usageExplorer.keys.all")}</option>
        </select>
        <select
          aria-label={t("admin.usageExplorer.step")}
          className={select}
          value={filters.kind}
          onChange={(e) => set("kind", e.target.value)}
        >
          <option value="">{t("admin.usageExplorer.allSteps")}</option>
          {(data?.options.kinds ?? []).map((k) => (
            <option key={k} value={k}>
              {t(`app.usage.kinds.${k}`, { defaultValue: k })}
            </option>
          ))}
        </select>
        <select
          aria-label={t("admin.usageExplorer.model")}
          className={select}
          value={filters.family}
          onChange={(e) => set("family", e.target.value)}
        >
          <option value="">{t("admin.usageExplorer.allModels")}</option>
          {(data?.options.families ?? []).map((f) => (
            <option key={f} value={f}>
              {familyName(f)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("admin.usageExplorer.account")}
          className={clsx(select, "max-w-[12rem]")}
          value={filters.userId}
          onChange={(e) => set("userId", e.target.value)}
        >
          <option value="">{t("admin.usageExplorer.allAccounts")}</option>
          {(data?.options.users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{t("admin.usageExplorer.error")}</p>}
      {!data && !error && <p className="mt-4 text-sm text-slate-500">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-lg bg-surface-2 p-3">
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{tile.value}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{tile.label}</p>
              </div>
            ))}
          </div>

          {data.totals.estimated_cost_usd > 0 && (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {t("admin.usageExplorer.estimatedNote", { cost: formatUsd(data.totals.estimated_cost_usd, lang) })}
            </p>
          )}

          {/* Main curve */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t(`admin.usageExplorer.metrics.${metric}`)}
              {series.length > 0 && value(series[peakIdx], metric) > 0 && (
                <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                  {t("admin.usageExplorer.peak", {
                    when: label(series[peakIdx].t),
                    value: fmt(metric, value(series[peakIdx], metric)),
                  })}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1 rounded-full border border-surface-border p-1">
              {METRICS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={clsx(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold transition",
                    metric === m
                      ? "bg-slate-900 text-white dark:bg-accent"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                  )}
                >
                  {t(`admin.usageExplorer.metrics.${m}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-3">
            {/* Recessive grid: max and half, labelled on the left. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[max, max / 2, 0].map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-right text-[10px] text-slate-400">{fmt(metric, g)}</span>
                  <div className="h-px flex-1 bg-surface-3" />
                </div>
              ))}
            </div>
            <div
              className="relative ml-16 flex h-48 items-end gap-[2px]"
              role="img"
              aria-label={t(`admin.usageExplorer.metrics.${metric}`)}
              onMouseLeave={() => setHover(null)}
            >
              {series.map((p, i) => {
                const v = value(p, metric);
                const h = v > 0 ? Math.max(2, (v / max) * 100) : 0;
                return (
                  <div
                    key={p.t}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end"
                    onMouseEnter={() => setHover(i)}
                  >
                    <div
                      className={clsx(
                        "flex w-full flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] transition-opacity",
                        hover !== null && hover !== i && "opacity-50",
                      )}
                      style={{ height: `${h}%` }}
                    >
                      {stacked ? (
                        presentFamilies
                          // Slivers under 2 % of the bar would only draw stray
                          // lines; the tooltip still lists them.
                          .filter((f) => p.cost_by_model[f] >= p.cost_usd * 0.02)
                          .map((f) => (
                            <div
                              key={f}
                              style={{
                                // Normalised: a flex-grow sum below 1 would
                                // only fill part of the bar.
                                flexGrow: p.cost_by_model[f] / Math.max(p.cost_usd, 1e-9),
                                flexBasis: 0,
                                background: FAMILY_COLOR[f] ?? "var(--viz-8)",
                              }}
                            />
                          ))
                      ) : (
                        <div className="flex-1" style={{ background: "var(--viz-1)" }} />
                      )}
                    </div>
                  </div>
                );
              })}
              {hovered && hover !== null && (
                <div
                  className="pointer-events-none absolute bottom-full z-10 mb-2 w-56 rounded-lg border border-surface-border bg-surface-1 p-2.5 text-xs shadow-card"
                  style={{
                    left: `${(hover / Math.max(series.length - 1, 1)) * 100}%`,
                    transform: `translateX(-${(hover / Math.max(series.length - 1, 1)) * 100}%)`,
                  }}
                >
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{label(hovered.t)}</p>
                  <dl className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                    {(
                      [
                        ["cost_usd", formatUsd(hovered.cost_usd, lang)],
                        ["questions", formatCount(hovered.questions, lang)],
                        ["users", formatCount(hovered.users, lang)],
                        ["calls", formatCount(hovered.calls, lang)],
                        ["tokens", formatCount(hovered.prompt_tokens + hovered.completion_tokens, lang)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt>{t(`admin.usageExplorer.metrics.${k}`)}</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {stacked && Object.keys(hovered.cost_by_model).length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-surface-border pt-1.5 text-slate-600 dark:text-slate-400">
                      {presentFamilies
                        .filter((f) => hovered.cost_by_model[f])
                        .map((f) => (
                          <li key={f} className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-sm" style={{ background: FAMILY_COLOR[f] }} />
                              {familyName(f)}
                            </span>
                            <span>{formatUsd(hovered.cost_by_model[f], lang)}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
          {series.length > 0 && (
            <div className="ml-16 mt-1.5 flex justify-between text-[10px] text-slate-400">
              <span>{label(series[0].t)}</span>
              <span>{label(series[series.length - 1].t)}</span>
            </div>
          )}
          {stacked && presentFamilies.length > 0 && (
            <ul className="ml-16 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {presentFamilies.map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FAMILY_COLOR[f] ?? "var(--viz-8)" }} />
                  {familyName(f)}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* Weekday x hour heatmap: when the peaks happen. */}
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t("admin.usageExplorer.heatmapTitle")}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {heatHover
                  ? t("admin.usageExplorer.heatCell", {
                      day: days[heatHover[0]],
                      hour: heatHover[1],
                      calls: formatCount(data.heatmap[heatHover[0]][heatHover[1]].calls, lang),
                      cost: formatUsd(data.heatmap[heatHover[0]][heatHover[1]].cost_usd, lang),
                    })
                  : t("admin.usageExplorer.heatmapHint")}
              </p>
              <div className="mt-2 overflow-x-auto" onMouseLeave={() => setHeatHover(null)}>
                <div className="grid min-w-[420px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[2px]">
                  {data.heatmap.map((row, d) => (
                    <div key={d} className="contents">
                      <span className="pr-1 text-right text-[10px] leading-4 text-slate-400">{days[d]}</span>
                      {row.map((c, h) => (
                        <div
                          key={h}
                          title={`${days[d]} ${h}h : ${c.calls} · ${formatUsd(c.cost_usd, lang)}`}
                          onMouseEnter={() => setHeatHover([d, h])}
                          className={clsx(
                            "h-4 rounded-[3px]",
                            c.calls === 0 && "bg-surface-3",
                            heatHover?.[0] === d && heatHover?.[1] === h && "ring-2 ring-slate-900 dark:ring-white",
                          )}
                          style={
                            c.calls > 0
                              ? {
                                  background: `color-mix(in srgb, var(--viz-1) ${Math.round(
                                    20 + 80 * (c.calls / heatMax),
                                  )}%, transparent)`,
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ))}
                  <span />
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h} className="text-center text-[9px] text-slate-400">
                      {h % 3 === 0 ? h : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Busiest slots */}
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t("admin.usageExplorer.peaksTitle")}
              </p>
              <ol className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {data.peaks.length === 0 && <li>{t("admin.aiCosts.empty")}</li>}
                {data.peaks.map((p, i) => (
                  <li key={p.t} className="flex justify-between gap-2">
                    <span className="truncate">
                      {i + 1}. {label(p.t)}
                    </span>
                    <span className="shrink-0">
                      {t("admin.usageExplorer.peakLine", {
                        calls: formatCount(p.calls, lang),
                        questions: formatCount(p.questions, lang),
                      })}{" "}
                      · {formatUsd(p.cost_usd, lang)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Cost per model, from the price grid (also the table view of the chart). */}
          <p className="mt-6 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {t("admin.usageExplorer.byModelTitle")}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr className="border-b border-surface-border">
                  <th className="py-1.5 pr-2 font-medium">{t("admin.usageExplorer.model")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("admin.usageExplorer.priceIn")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("admin.usageExplorer.priceOut")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("admin.usageExplorer.tokensIn")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("admin.usageExplorer.tokensOut")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("admin.usageExplorer.pages")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("admin.usageExplorer.cost")}</th>
                  <th className="py-1.5 text-right font-medium">{t("admin.usageExplorer.share")}</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300">
                {data.by_model.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-2 text-slate-500">
                      {t("admin.aiCosts.empty")}
                    </td>
                  </tr>
                )}
                {data.by_model.map((m) => (
                  <tr key={m.family} className="border-b border-surface-border/60">
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: FAMILY_COLOR[m.family] ?? "var(--viz-8)" }}
                        />
                        <span className="font-medium">{familyName(m.family)}</span>
                        <span className="truncate font-mono text-[10px] text-slate-400">{m.models.join(", ")}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {m.price?.page_usd != null
                        ? t("admin.usageExplorer.perPage", { price: formatUsd(m.price.page_usd, lang) })
                        : m.price?.input_usd_per_m != null
                          ? formatUsd(m.price.input_usd_per_m, lang)
                          : "-"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {m.price?.output_usd_per_m != null ? formatUsd(m.price.output_usd_per_m, lang) : "-"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{formatCount(m.prompt_tokens, lang)}</td>
                    <td className="py-1.5 pr-2 text-right">{formatCount(m.completion_tokens, lang)}</td>
                    <td className="py-1.5 pr-2 text-right">{m.pages ? formatCount(m.pages, lang) : "-"}</td>
                    <td className="py-1.5 pr-2 text-right font-medium">{formatUsd(m.cost_usd, lang)}</td>
                    <td className="py-1.5 text-right">{m.share_pct} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">{t("admin.usageExplorer.note")}</p>
        </>
      )}
    </section>
  );
}
