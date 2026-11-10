import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins, KeyRound, Gift } from "lucide-react";
import clsx from "clsx";
import type { UsageSummary } from "../../types";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { formatCount, formatUsd } from "../../utils/format";

/** Small "tokens" chip under an assistant answer: a click opens the detail
 * of what the answer consumed (tokens sent / received per step, estimated
 * cost, and who pays - the user's own Mistral key or the platform). */
export default function UsageButton({ usage }: { usage: UsageSummary }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEscapeToClose(open, close);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const lang = i18n.language;
  const total = usage.prompt_tokens + usage.completion_tokens;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t("app.usage.button")}
        className="flex items-center gap-1 rounded-full border border-surface-border bg-surface-1 px-2 py-0.5 text-[11px] text-slate-500 transition hover:border-accent hover:text-accent dark:text-slate-400"
      >
        <Coins size={11} />
        {t("app.usage.tokens", { count: total, value: formatCount(total, lang) })}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("app.usage.title")}
          className="absolute left-0 z-20 mt-1.5 w-72 rounded-xl border border-surface-border bg-surface-1 p-3 text-xs shadow-card"
        >
          <p className="font-semibold text-slate-900 dark:text-slate-100">{t("app.usage.title")}</p>
          <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
            <div className="flex justify-between">
              <dt>{t("app.usage.sent")}</dt>
              <dd className="font-medium">{formatCount(usage.prompt_tokens, lang)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("app.usage.received")}</dt>
              <dd className="font-medium">{formatCount(usage.completion_tokens, lang)}</dd>
            </div>
            <div className="flex justify-between border-t border-surface-border pt-1">
              <dt>{t("app.usage.cost")}</dt>
              <dd className="font-semibold text-slate-900 dark:text-slate-100">{formatUsd(usage.cost_usd, lang)}</dd>
            </div>
          </dl>

          {usage.details.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-surface-border pt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {usage.details.map((d) => (
                <li key={d.kind} className="flex justify-between gap-2">
                  <span className="truncate" title={d.model}>
                    {t(`app.usage.kinds.${d.kind}`, { defaultValue: d.label })}
                  </span>
                  <span className="shrink-0">
                    {d.pages
                      ? t("app.usage.pages", { count: d.pages })
                      : formatCount(d.prompt_tokens + d.completion_tokens, lang)}{" "}
                    · {formatUsd(d.cost_usd, lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {t("app.usage.per1000", { value: formatUsd(usage.cost_usd * 1000, lang) })}
          </p>
          <p
            className={clsx(
              "mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px]",
              usage.own_key
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {usage.own_key ? <KeyRound size={12} /> : <Gift size={12} />}
            {usage.own_key ? t("app.usage.ownKey") : t("app.usage.platform")}
          </p>
          {usage.estimated && <p className="mt-1 text-[10px] text-slate-400">{t("app.usage.estimated")}</p>}
        </div>
      )}
    </div>
  );
}
