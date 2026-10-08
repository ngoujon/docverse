import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import AuthLayout from "../components/AuthLayout";
import Captcha from "../components/Captcha";
import SsoButtons from "../components/SsoButtons";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { usePageMeta } from "../hooks/usePageMeta";
import type { CaptchaSolution } from "../types";
import { pageTitle } from "../brand";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from || "/dashboard";
  usePageMeta({ title: pageTitle(t("auth.register.title")), description: t("auth.register.subtitle"), noindex: true });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaSolution | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email && password.length >= 8 && captcha && termsAccepted && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await register(email, password, displayName, captcha!, termsAccepted);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setCaptchaKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      footer={
        <>
          {t("auth.register.hasAccount")}{" "}
          <Link to="/login" state={location.state} className="font-medium text-accent hover:underline">
            {t("auth.register.loginLink")}
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {t("auth.displayName")}
          </label>
          <input
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {t("auth.email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {t("auth.password")}
          </label>
          <div className="relative">
            <input
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 pr-9 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
              tabIndex={-1}
            >
              {visible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <PasswordStrengthMeter password={password} />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("auth.register.passwordHint")}</p>
        </div>

        <Captcha key={captchaKey} onReady={setCaptcha} />

        {/* Explicit, recorded acceptance of the CGU + privacy policy: the
            backend refuses to create an account without it and stores the
            date, so the terms in force that day can be produced later. */}
        <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
          />
          <span>
            {t("auth.register.terms")}{" "}
            <Link to="/cgu/" target="_blank" className="text-accent hover:underline">
              {t("auth.register.termsLinkTerms")}
            </Link>{" "}
            &middot;{" "}
            <Link to="/confidentialite/" target="_blank" className="text-accent hover:underline">
              {t("auth.register.termsLinkPrivacy")}
            </Link>
          </span>
        </label>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-accent px-3 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>

        <SsoButtons next={redirectTo} />

        <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {t("auth.register.ssoTerms")}
        </p>
      </div>
    </AuthLayout>
  );
}
