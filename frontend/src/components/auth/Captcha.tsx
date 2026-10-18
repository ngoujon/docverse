import { useTranslation } from "react-i18next";
import { ShieldCheck, Loader2 } from "lucide-react";
import type { CaptchaStatus } from "../../hooks/useCaptcha";

/** Visible progress of the proof-of-work captcha solved by useCaptcha(). */
export default function Captcha({ status }: { status: CaptchaStatus }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-xs">
      {status === "ready" || status === "error" ? (
        <ShieldCheck size={15} className={`shrink-0 ${status === "ready" ? "text-emerald-500" : "text-red-500"}`} />
      ) : (
        <Loader2 size={15} className="shrink-0 animate-spin text-slate-500 dark:text-slate-400" />
      )}
      <span className="text-slate-600 dark:text-slate-400">{t(`captcha.${status}`)}</span>
    </div>
  );
}
