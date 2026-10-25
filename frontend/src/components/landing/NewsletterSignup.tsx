import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, CheckCircle2 } from "lucide-react";
import { api } from "../../api/client";
import { useCaptcha } from "../../hooks/useCaptcha";
import { trackConversion } from "../../utils/seoMonitor";

/** Footer newsletter form (double opt-in: the backend emails a link). */
export default function NewsletterSignup() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const { solution: captcha, reset: resetCaptcha } = useCaptcha();
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const canSubmit = /\S+@\S+\.\S+/.test(email) && captcha && state !== "submitting";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setState("submitting");
    try {
      await api.newsletterSubscribe(email, captcha!);
      trackConversion("Newsletter");
      setState("done");
    } catch {
      setState("error");
      resetCaptcha();
    }
  };

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-fluent-green">
        <CheckCircle2 size={16} />
        {t("newsletter.signup.done")}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-2">
      <div className="flex items-center gap-2 rounded-full border border-fluent-line bg-white py-1 pl-4 pr-1 shadow-card focus-within:border-fluent-indigo focus-within:shadow-focus">
        <Mail size={15} className="shrink-0 text-fluent-muted" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("newsletter.signup.placeholder")}
          className="w-full bg-transparent text-sm text-fluent-navy outline-none placeholder:text-slate-400"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="shrink-0 rounded-full bg-fluent-indigo px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-fluent-navy disabled:opacity-40"
        >
          {t("newsletter.signup.submit")}
        </button>
      </div>
      {state === "error" && <p className="text-xs text-red-600">{t("newsletter.signup.error")}</p>}
    </div>
  );
}
