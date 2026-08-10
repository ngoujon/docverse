import { useTranslation } from "react-i18next";
import { FileText, Image, FileCode, Sparkles, MessageSquareText, AudioLines } from "lucide-react";

const NODES = [
  { Icon: FileText, x: 8, y: 12, delay: "0s", color: "text-retro-pink", ring: "border-retro-pink/50" },
  { Icon: Image, x: 86, y: 6, delay: "0.5s", color: "text-retro-cyan", ring: "border-retro-cyan/50" },
  { Icon: AudioLines, x: 92, y: 52, delay: "1s", color: "text-retro-yellow", ring: "border-retro-yellow/50" },
  { Icon: MessageSquareText, x: 70, y: 82, delay: "1.5s", color: "text-retro-orange", ring: "border-retro-orange/50" },
  { Icon: FileCode, x: 6, y: 68, delay: "2s", color: "text-retro-purple", ring: "border-retro-purple/50" },
];

export default function HighlightBanner() {
  const { t } = useTranslation();

  return (
    <div className="border-y border-retro-border bg-slate-900">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-12">
        <div className="text-center lg:text-left">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-cyan">
            {t("highlight.eyebrow")}
          </p>
          <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">{t("highlight.title")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("highlight.desc")}</p>
        </div>

        <div className="relative mx-auto h-[220px] w-full max-w-sm lg:max-w-none" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 90" preserveAspectRatio="none">
            {NODES.map((n, i) => (
              <line
                key={i}
                x1={n.x + 4}
                y1={n.y + 4}
                x2="50"
                y2="45"
                stroke="#8b2fd6"
                strokeWidth="0.5"
                strokeDasharray="3 2"
                opacity="0.4"
              />
            ))}
          </svg>

          <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-gradient-to-br from-retro-pink to-retro-purple shadow-[0_0_30px_rgba(224,28,192,0.5)] animate-glow-pulse">
            <Sparkles size={24} className="text-white" />
          </div>

          {NODES.map(({ Icon, x, y, delay, color, ring }, i) => (
            <div
              key={i}
              className={`absolute flex h-11 w-11 animate-float items-center justify-center rounded-xl border bg-slate-800 shadow-[0_6px_20px_rgba(0,0,0,0.5)] ${ring}`}
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: delay }}
            >
              <Icon size={19} className={color} strokeWidth={2.25} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
