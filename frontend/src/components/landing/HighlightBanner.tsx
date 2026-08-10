import { useTranslation } from "react-i18next";
import { FileText, Image, FileCode, Sparkles, MessageSquareText } from "lucide-react";

const NODES = [
  { Icon: FileText, x: 12, y: 14, delay: "0s", color: "text-retro-pink" },
  { Icon: Image, x: 82, y: 10, delay: "0.6s", color: "text-retro-cyan" },
  { Icon: FileCode, x: 8, y: 74, delay: "1.1s", color: "text-retro-purple" },
  { Icon: MessageSquareText, x: 84, y: 76, delay: "1.7s", color: "text-retro-orange" },
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

          {NODES.map(({ Icon, x, y, delay, color }, i) => (
            <div
              key={i}
              className="absolute flex h-9 w-9 animate-float items-center justify-center rounded-xl border border-retro-border/60 bg-slate-800 shadow-lg"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: delay }}
            >
              <Icon size={16} className={color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
