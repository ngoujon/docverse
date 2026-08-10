import { useTranslation } from "react-i18next";
import TerminalWindow from "./TerminalWindow";

interface StepItem {
  title: string;
  desc: string;
}

export default function OnboardingTerminal() {
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
