/** Account settings, AI part: personal Mistral API key (with the limits the
 * user sets for it) and the account's AI consumption. */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, ExternalLink, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { buttonOutline } from "../ui/controls";
import { formatCount, formatUsd } from "../../utils/format";
import type { AISettings, UsageReport } from "../../types";
import { cardClass, CardRow, Feedback, iconMuted, input, muted } from "./AccountCard";

/** Personal Mistral key: once saved, the account's AI is billed to the
 * user's own Mistral account and the platform's AI quotas are lifted. */
export function AIKeyCard({ onChange }: { onChange?: () => void }) {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [daily, setDaily] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useAsyncAction();
  const remove = useAsyncAction();
  const limits = useAsyncAction();

  const apply = (s: AISettings) => {
    setSettings(s);
    setDaily(s.daily_messages ? String(s.daily_messages) : "");
    setBudget(s.monthly_budget_usd ? String(s.monthly_budget_usd) : "");
  };

  useEffect(() => {
    api.aiSettings().then(apply).catch(() => setSettings(null));
  }, []);

  if (!settings) return null;

  const done = (text: string) => {
    setMessage({ ok: true, text });
    onChange?.();
  };

  const handleSave = async () => {
    setMessage(null);
    if (await save.run(async () => apply(await api.saveAIKey(keyInput.trim())))) {
      setKeyInput("");
      done(t("auth.account.ai.saved"));
    }
  };

  const handleRemove = async () => {
    setMessage(null);
    if (await remove.run(async () => apply(await api.deleteAIKey()))) done(t("auth.account.ai.removed"));
  };

  const handleLimits = async () => {
    setMessage(null);
    const dailyValue = daily.trim() ? Math.max(0, Math.round(Number(daily))) : 0;
    const budgetValue = budget.trim() ? Math.max(0, Number(budget.replace(",", "."))) : 0;
    const payload = { daily_messages: dailyValue || null, monthly_budget_usd: budgetValue || null };
    if (await limits.run(async () => apply(await api.updateAILimits(payload)))) {
      done(t("auth.account.ai.limitsSaved"));
    }
  };

  const error = save.error || remove.error || limits.error;
  const feedback = message ?? (error ? { ok: false, text: error } : null);

  return (
    <div className={`mt-3 ${cardClass}`}>
      <CardRow
        icon={<KeyRound size={15} className={iconMuted} />}
        label={t("auth.account.ai.keyTitle")}
        action={
          settings.has_own_key ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={13} /> {t("auth.account.ai.active", { hint: settings.key_hint ?? "" })}
            </span>
          ) : undefined
        }
      />
      <p className={`mt-2 ${muted}`}>
        {t("auth.account.ai.intro", {
          messages: settings.free_messages_per_day,
          pages: settings.free_scanned_pages_per_day,
        })}{" "}
        <a
          href="https://console.mistral.ai/api-keys"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-accent hover:underline"
        >
          {t("auth.account.ai.getKey")} <ExternalLink size={11} />
        </a>
      </p>
      {settings.key_unreadable && <p className="mt-2 text-xs text-amber-600">{t("auth.account.ai.unreadable")}</p>}

      <div className="mt-3 flex items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          aria-label={t("auth.account.ai.keyLabel")}
          placeholder={settings.has_own_key ? t("auth.account.ai.replacePlaceholder") : t("auth.account.ai.placeholder")}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && keyInput.trim() && handleSave()}
          className={`${input} flex-1`}
        />
        <button
          onClick={handleSave}
          disabled={save.busy || keyInput.trim().length < 16}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
        >
          {save.busy ? t("auth.account.ai.checking") : t("auth.account.ai.save")}
        </button>
      </div>
      <p className={`mt-1.5 ${muted}`}>{t("auth.account.ai.security")}</p>

      {settings.has_own_key && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("auth.account.ai.limitsTitle")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600 dark:text-slate-400">
              {t("auth.account.ai.dailyMessages")}
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t("auth.account.ai.noLimit")}
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-400">
              {t("auth.account.ai.monthlyBudget")}
              <input
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                placeholder={t("auth.account.ai.noLimit")}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
          </div>
          <p className={muted}>
            {t("auth.account.ai.monthCost", { cost: formatUsd(settings.month_cost_own_key_usd, i18n.language) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleLimits} disabled={limits.busy} className={buttonOutline}>
              {t("auth.account.ai.saveLimits")}
            </button>
            <button
              onClick={handleRemove}
              disabled={remove.busy}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 size={13} /> {t("auth.account.ai.remove")}
            </button>
          </div>
        </div>
      )}
      {feedback && <Feedback {...feedback} />}
    </div>
  );
}

/** What the account's AI requests consumed: today, this month, by step,
 * and how much of it the platform covered vs. the user's own key. */
export function AIUsageCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t, i18n } = useTranslation();
  const [report, setReport] = useState<UsageReport | null>(null);
  const lang = i18n.language;

  useEffect(() => {
    api.myAIUsage(30).then(setReport).catch(() => setReport(null));
  }, [refreshKey]);

  if (!report) return null;
  const tokens = (x: { prompt_tokens: number; completion_tokens: number }) => x.prompt_tokens + x.completion_tokens;
  const max = Math.max(1, ...report.series.map((p) => p.tokens));

  return (
    <div className={`mt-3 ${cardClass}`}>
      <CardRow icon={<BarChart3 size={15} className={iconMuted} />} label={t("auth.account.ai.usageTitle")} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          { label: t("auth.account.ai.todayTokens"), value: formatCount(tokens(report.today), lang) },
          { label: t("auth.account.ai.monthTokens"), value: formatCount(tokens(report.month), lang) },
          { label: t("auth.account.ai.monthCostLabel"), value: formatUsd(report.month.cost_usd, lang) },
          { label: t("auth.account.ai.offered"), value: formatUsd(report.month_platform.cost_usd, lang) },
        ].map((c) => (
          <div key={c.label}>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{c.value}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex h-16 items-end gap-[2px]" role="img" aria-label={t("auth.account.ai.chart")}>
        {report.series.map((p) => (
          <div
            key={p.date}
            title={`${p.date} : ${formatCount(p.tokens, lang)} tokens · ${formatUsd(p.cost_usd, lang)}`}
            className={p.tokens > 0 ? "flex-1 rounded-t-[2px] bg-fluent-indigo/70" : "flex-1 rounded-t-[2px] bg-surface-3"}
            style={{ height: p.tokens > 0 ? `${Math.max(8, (p.tokens / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>

      {report.by_kind.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-surface-border pt-3 text-xs text-slate-600 dark:text-slate-400">
          {report.by_kind.map((k) => (
            <li key={k.kind} className="flex justify-between gap-2">
              <span>{t(`app.usage.kinds.${k.kind}`, { defaultValue: k.label })}</span>
              <span>
                {k.pages ? t("app.usage.pages", { count: k.pages }) : `${formatCount(tokens(k), lang)} tokens`} ·{" "}
                {formatUsd(k.cost_usd, lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-3 ${muted}`}>{t("auth.account.ai.estimateNote")}</p>
    </div>
  );
}
