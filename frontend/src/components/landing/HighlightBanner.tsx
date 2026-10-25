import { useTranslation } from "react-i18next";
import { FileText, Image, FileCode, MessageSquareText, AudioLines } from "lucide-react";
import { BrandMark } from "../ui/BrandLogo";

const NODES = [
  // x/y are % of the box; x stays <= 86 so the 44px tiles never clip.
  { Icon: FileText, x: 6, y: 10, delay: "0s" },
  { Icon: Image, x: 80, y: 4, delay: "0.5s" },
  { Icon: AudioLines, x: 86, y: 50, delay: "1s" },
  { Icon: MessageSquareText, x: 64, y: 80, delay: "1.5s" },
  { Icon: FileCode, x: 4, y: 66, delay: "2s" },
];

/** Navy band illustrating "every format becomes searchable knowledge". */
export default function HighlightBanner() {
  const { t } = useTranslation();

  return (
    <div className="bg-fluent-navy px-4 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-semibold text-[#a5a1ff]">{t("highlight.eyebrow")}</p>
          <h2 className="mt-3 text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-white sm:text-4xl">
            {t("highlight.title")}
          </h2>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-[#adbdcc] sm:text-[17px]">
            {t("highlight.desc")}
          </p>
        </div>

        <div className="relative mx-auto h-[220px] w-full max-w-sm sm:h-[240px] lg:max-w-none" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 90" preserveAspectRatio="none">
            {NODES.map((n, i) => (
              <line
                key={i}
                x1={n.x + 4}
                y1={n.y + 4}
                x2="50"
                y2="45"
                stroke="#a5a1ff"
                strokeWidth="0.4"
                strokeDasharray="3 2"
                opacity="0.5"
              />
            ))}
          </svg>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[14px] shadow-[0_0_0_8px_rgba(99,91,255,0.15),0_20px_40px_-10px_rgba(99,91,255,0.6)]">
            <BrandMark className="h-14 w-14" />
          </div>

          {NODES.map(({ Icon, x, y, delay }, i) => (
            <div
              key={i}
              className="absolute flex h-11 w-11 animate-float items-center justify-center rounded-lg border border-white/10 bg-white/5 backdrop-blur"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: delay }}
            >
              <Icon size={19} className="text-white/85" strokeWidth={2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
