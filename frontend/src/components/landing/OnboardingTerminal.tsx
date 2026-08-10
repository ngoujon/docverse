import { useTranslation } from "react-i18next";
import TerminalWindow from "./TerminalWindow";

interface StepItem {
  title: string;
  desc: string;
}

const COMMANDS = ["open-rag signup && new-space", "open-rag upload ./docs/*", "open-rag chat --share viewer"];

export default function OnboardingTerminal() {
  const { t } = useTranslation();
  const steps = t("steps.items", { returnObjects: true }) as StepItem[];

  return (
    <TerminalWindow title="~/onboarding">
      <div className="space-y-4 bg-slate-950 p-4 font-mono text-xs sm:p-6 sm:text-sm">
        {steps.map((s, i) => (
          <div key={s.title}>
            <p className="text-emerald-400">
              <span className="text-slate-500">➜ </span>
              {COMMANDS[i]}
            </p>
            <p className="mt-1 pl-4 text-slate-300">
              <span className="text-retro-pink"># {s.title}</span> — {s.desc}
            </p>
          </div>
        ))}
        <p className="text-emerald-400">
          <span className="text-slate-500">➜ </span>
          <span className="inline-block h-3.5 w-[7px] animate-blink bg-emerald-400 align-middle" />
        </p>
      </div>
    </TerminalWindow>
  );
}
