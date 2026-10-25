import { useTranslation } from "react-i18next";
import { Check, MousePointerClick, PartyPopper, RotateCcw } from "lucide-react";
import clsx from "clsx";
import type { StepIndex } from "./types";

interface Step {
  title: string;
  desc: string;
}

/** Guided-tour strip above the demo: five steps that tick themselves off
 * as the visitor uses the workspace, with a "show me" hint on the next one. */
export default function DemoTour({
  done,
  onShow,
  onRestart,
}: {
  done: Set<StepIndex>;
  onShow: (step: StepIndex) => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const steps = t("demoApp.tour.steps", { returnObjects: true }) as Step[];
  const current = steps.findIndex((_, i) => !done.has(i as StepIndex));
  const finished = current === -1;

  return (
    <div className="rounded-xl border border-fluent-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fluent-navy">{t("demoApp.tour.title")}</p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-fluent-muted">
            {t("demoApp.tour.progress", { done: done.size, total: steps.length })}
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-fluent-soft sm:w-32">
            <div
              className="h-full rounded-full bg-fluent-indigo transition-all duration-500"
              style={{ width: `${(done.size / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {finished ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg bg-fluent-green-soft p-4 animate-fade-in sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-fluent-green shadow-card">
            <PartyPopper size={18} />
          </span>
          <div className="flex-1">
            <p className="font-semibold text-fluent-navy">{t("demoApp.tour.doneTitle")}</p>
            <p className="text-sm text-fluent-text">{t("demoApp.tour.doneText")}</p>
          </div>
          <button
            onClick={onRestart}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-fluent-line bg-white px-4 py-2 text-sm font-semibold text-fluent-navy shadow-card transition hover:border-slate-300"
          >
            <RotateCcw size={14} /> {t("demoApp.tour.restart")}
          </button>
        </div>
      ) : (
        <ol className="-mx-1 mt-4 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:grid lg:grid-cols-5 lg:overflow-visible">
          {steps.map((step, i) => {
            const isDone = done.has(i as StepIndex);
            const isCurrent = i === current;
            return (
              <li
                key={step.title}
                className={clsx(
                  "flex w-[220px] shrink-0 snap-start flex-col rounded-lg border p-3 transition lg:w-auto",
                  isCurrent
                    ? "border-fluent-indigo bg-fluent-indigo-soft/50"
                    : isDone
                      ? "border-fluent-line bg-white"
                      : "border-fluent-line bg-fluent-soft/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isDone
                        ? "bg-fluent-green text-white"
                        : isCurrent
                          ? "bg-fluent-indigo text-white"
                          : "bg-white text-fluent-muted ring-1 ring-fluent-line",
                    )}
                  >
                    {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
                  </span>
                  <p className={clsx("text-sm font-semibold", isDone ? "text-fluent-muted" : "text-fluent-navy")}>
                    {step.title}
                  </p>
                </div>
                <p className="mt-1.5 text-pretty text-xs leading-relaxed text-fluent-text">{step.desc}</p>
                {isCurrent && (
                  <button
                    onClick={() => onShow(i as StepIndex)}
                    className="mt-2.5 flex w-fit items-center gap-1 text-xs font-semibold text-fluent-indigo hover:text-fluent-navy"
                  >
                    <MousePointerClick size={13} /> {t("demoApp.tour.show")}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
