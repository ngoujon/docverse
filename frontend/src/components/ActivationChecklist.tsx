import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Circle, X } from "lucide-react";
import type { MeStats } from "../types";

const DISMISSED_KEY = "open-rag:activation-dismissed";

interface Props {
  stats: MeStats;
  onCreateSpace: () => void;
}

export default function ActivationChecklist({ stats, onCreateSpace }: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");

  const steps = [
    { done: stats.owned_spaces > 0, label: t("activation.step1"), onClick: onCreateSpace },
    { done: stats.document_count > 0, label: t("activation.step2") },
    { done: stats.message_count > 0, label: t("activation.step3") },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || doneCount === steps.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* localStorage unavailable - just hide for this session */
    }
    setDismissed(true);
  };

  return (
    <div className="relative mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <button
        onClick={dismiss}
        aria-label={t("common.close")}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <X size={15} />
      </button>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("activation.title")}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {t("activation.progress", { done: doneCount, total: steps.length })}
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <Check size={16} className="shrink-0 text-emerald-500" />
            ) : (
              <Circle size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
            )}
            {!step.done && step.onClick ? (
              <button
                onClick={step.onClick}
                className="text-left text-accent underline-offset-2 hover:underline"
              >
                {step.label}
              </button>
            ) : (
              <span className={step.done ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-700 dark:text-slate-300"}>
                {step.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
