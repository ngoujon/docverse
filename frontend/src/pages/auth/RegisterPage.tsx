import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useCaptcha } from "../../hooks/useCaptcha";
import { usePageMeta } from "../../hooks/usePageMeta";
import AuthLayout from "../../components/auth/AuthLayout";
import Captcha from "../../components/auth/Captcha";
import SsoButtons from "../../components/auth/SsoButtons";
import PasswordStrengthMeter from "../../components/ui/PasswordStrengthMeter";
import { buttonPrimaryWide, Field, inputClass, PasswordInput } from "../../components/ui/controls";
import { pageTitle } from "../../brand";
import { trackConversion } from "../../utils/seoMonitor";

/** Account creation: email/password + captcha + explicit terms acceptance. */
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const captcha = useCaptcha();
  const { busy: submitting, error, run } = useAsyncAction();

  const canSubmit = email && password.length >= 8 && captcha.solution && termsAccepted && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const ok = await run(async () => {
      await register(email, password, displayName, captcha.solution!, termsAccepted);
      trackConversion("Inscription", { methode: "email" });
      navigate(redirectTo);
    });
    // A captcha solution is single-use: solve a fresh one for the retry.
    if (!ok) captcha.reset();
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
        <Field label={t("auth.displayName")}>
          <input
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("auth.email")}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("auth.password")}>
          <PasswordInput value={password} onChange={setPassword} onEnter={handleSubmit} />
          <PasswordStrengthMeter password={password} />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("auth.register.passwordHint")}</p>
        </Field>

        <Captcha status={captcha.status} />

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

        <button onClick={handleSubmit} disabled={!canSubmit} className={buttonPrimaryWide}>
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
