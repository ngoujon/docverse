import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, FileText, Search, Sparkles } from "lucide-react";
import { BrandMark } from "../ui/BrandLogo";

/** App-window card (title bar + body) around landing content. */
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
    <div className={`overflow-hidden rounded-xl border border-fluent-line bg-white shadow-card-lg ${className}`}>
      <div className="flex items-center gap-2 border-b border-fluent-line bg-fluent-soft px-4 py-2.5">
        <BrandMark className="h-4 w-4" />
        <span className="truncate text-xs font-medium text-fluent-navy">{title}</span>
        <span className="ml-auto hidden items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] text-fluent-muted ring-1 ring-fluent-line sm:flex">
          <Search size={10} /> ⌘K
        </span>
      </div>
      {children}
    </div>
  );
}

interface StepItem {
  title: string;
  desc: string;
}

/** "Get started in 3 steps": numbered columns separated by thin rules. */
export function OnboardingTerminal() {
  const { t } = useTranslation();
  const steps = t("steps.items", { returnObjects: true }) as StepItem[];

  return (
    <ol className="grid gap-8 md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="border-l border-fluent-line pl-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-fluent-indigo-soft text-sm font-bold text-fluent-indigo">
            {i + 1}
          </span>
          <p className="mt-4 text-balance font-semibold leading-snug text-fluent-navy">{s.title}</p>
          <p className="mt-2 text-pretty text-[15px] leading-relaxed text-fluent-text">{s.desc}</p>
        </li>
      ))}
    </ol>
  );
}

/** Static mock of a chat answer with a cited source (hero illustration). */
export function ChatMockup() {
  const { t } = useTranslation();

  return (
    <TerminalWindow title="Docverse · contrats">
      <div className="space-y-4 p-5">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-fluent-indigo px-3.5 py-2 text-sm text-white">
            {t("demo.question")}
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo">
            <Sparkles size={14} />
          </span>
          <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-fluent-line bg-white px-3.5 py-2.5 text-sm leading-relaxed text-fluent-navy">
            {t("demo.answer")}
            <span className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-fluent-indigo-soft px-2.5 py-0.5 text-[11px] font-medium text-fluent-indigo-dark">
                <FileText size={11} /> {t("demo.source")}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-10 text-xs text-fluent-muted">
          <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-fluent-indigo" />
          {t("demo.typing")}
        </div>
      </div>
      <div className="border-t border-fluent-line p-3">
        <div className="flex items-center gap-2 rounded-lg border border-fluent-line bg-white py-1.5 pl-3 pr-1.5 shadow-card">
          <span className="flex-1 truncate text-sm text-slate-400">{t("app.chat.placeholder")}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fluent-indigo text-white">
            <ArrowUp size={14} />
          </span>
        </div>
      </div>
    </TerminalWindow>
  );
}
