import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { usePageMeta } from "../../hooks/usePageMeta";
import AuthLayout from "../../components/auth/AuthLayout";
import SsoButtons from "../../components/auth/SsoButtons";
import { buttonPrimaryWide, Field, inputClass, PasswordInput } from "../../components/ui/controls";
import { pageTitle } from "../../brand";

/** Email/password login, followed by a TOTP step when 2FA is enabled. */
export default function LoginPage() {
  const { t } = useTranslation();
  const { login, verify2fa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from || "/dashboard";
  usePageMeta({ title: pageTitle(t("auth.login.title")), description: t("auth.login.subtitle"), noindex: true });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const { busy: submitting, error, run } = useAsyncAction();

  const handleSubmit = () => {
    if (!email || !password || submitting) return;
    run(async () => {
      const result = await login(email, password);
      if (result.requires2fa && result.pendingToken) setPendingToken(result.pendingToken);
      else navigate(redirectTo);
    });
  };

  const handleVerify2fa = () => {
    if (!pendingToken || code.length < 6 || submitting) return;
    run(async () => {
      await verify2fa(pendingToken, code);
      navigate(redirectTo);
    });
  };

  if (pendingToken) {
    return (
      <AuthLayout title={t("auth.twofa.title")} subtitle={t("auth.twofa.subtitle")}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <ShieldCheck size={16} />
            <span className="text-xs">{t("auth.twofa.hint")}</span>
          </div>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleVerify2fa()}
            placeholder="000000"
            className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={handleVerify2fa} disabled={code.length < 6 || submitting} className={buttonPrimaryWide}>
            {submitting ? t("auth.twofa.verifying") : t("auth.twofa.submit")}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link to="/register" state={location.state} className="font-medium text-accent hover:underline">
            {t("auth.login.registerLink")}
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("auth.email")}>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className={inputClass}
          />
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">{t("auth.password")}</label>
            <Link to="/forgot-password" className="text-xs text-accent hover:underline">
              {t("auth.login.forgot")}
            </Link>
          </div>
          <PasswordInput value={password} onChange={setPassword} onEnter={handleSubmit} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button onClick={handleSubmit} disabled={!email || !password || submitting} className={buttonPrimaryWide}>
          {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>

        <SsoButtons next={redirectTo} />
      </div>
    </AuthLayout>
  );
}
