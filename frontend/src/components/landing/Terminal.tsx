import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Sparkles } from "lucide-react";

/** Retro window chrome (traffic lights + title bar) around landing content. */
export function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-retro-border bg-retro-panel shadow-[0_20px_60px_-15px_rgba(139,47,214,0.35)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-retro-border bg-retro-bg2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-retro-pink/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-retro-yellow/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-retro-cyan/70" />
        <span className="ml-2 truncate font-mono text-[10px] uppercase tracking-wider text-slate-500">{title}</span>
      </div>
      {children}
    </div>
  );
}

interface StepItem {
  title: string;
  desc: string;
}

/** "Get started in 3 steps" list, rendered as a terminal window. */
export function OnboardingTerminal() {
  const { t } = useTranslation();
  const steps = t("steps.items", { returnObjects: true }) as StepItem[];

  return (
    <TerminalWindow title={t("steps.windowTitle")}>
      <div className="divide-y divide-retro-border/60 bg-retro-panel">
        {steps.map((s, i) => (
          <div key={s.title} className="flex items-start gap-4 p-4 sm:p-5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-retro-pink/10 font-mono text-xs font-semibold text-retro-pink">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </TerminalWindow>
  );
}

/** Static mock of a chat answer with a cited source (hero illustration). */
export function ChatMockup() {
  const { t } = useTranslation();

  return (
    <TerminalWindow title="espace-qa.local/app/contrats">
      <div className="space-y-3 bg-retro-bg2/60 p-4 sm:p-5">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-retro-purple px-3.5 py-2 text-xs text-white sm:text-sm">
            {t("demo.question")}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-retro-pink/15 text-retro-pink">
            <Sparkles size={13} />
          </span>
          <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-retro-border bg-white px-3.5 py-2 text-xs text-slate-700 sm:text-sm">
            {t("demo.answer")}
            <span className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-retro-border bg-retro-bg2 px-2 py-0.5 font-mono text-[10px] text-retro-cyan">
                <FileText size={10} /> {t("demo.source")}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-8 font-mono text-[10px] text-slate-400">
          <span className="inline-block h-3 w-[6px] animate-blink bg-retro-pink" />
          {t("demo.typing")}
        </div>
      </div>
    </TerminalWindow>
  );
}
