import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, CheckCircle2 } from "lucide-react";
import { api } from "../api/client";
import Captcha from "./Captcha";
import type { CaptchaSolution } from "../types";

export default function NewsletterSignup() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaSolution | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const canSubmit = /\S+@\S+\.\S+/.test(email) && captcha && state !== "submitting";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setState("submitting");
    try {
      await api.newsletterSubscribe(email, captcha!);
      setState("done");
    } catch {
      setState("error");
      setCaptchaKey((k) => k + 1);
    }
  };

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 text-sm text-retro-purple">
        <CheckCircle2 size={16} />
        {t("newsletter.signup.done")}
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-retro-border bg-white px-3 py-2">
        <Mail size={15} className="shrink-0 text-slate-400" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("newsletter.signup.placeholder")}
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="shrink-0 rounded-md bg-retro-pink px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white disabled:opacity-40"
        >
          {t("newsletter.signup.submit")}
        </button>
      </div>
      <Captcha key={captchaKey} onReady={setCaptcha} />
      {state === "error" && <p className="text-xs text-red-500">{t("newsletter.signup.error")}</p>}
    </div>
  );
}
