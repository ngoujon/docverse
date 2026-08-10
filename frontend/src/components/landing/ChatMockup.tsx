import { useTranslation } from "react-i18next";
import { FileText, Sparkles } from "lucide-react";
import TerminalWindow from "./TerminalWindow";

export default function ChatMockup() {
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
