import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import AuthLayout from "../components/AuthLayout";
import SsoButtons from "../components/SsoButtons";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageTitle } from "../brand";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, verify2fa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from || "/dashboard";
  usePageMeta({ title: pageTitle(t("auth.login.title")), noindex: true });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const handleSubmit = async () => {
    if (!email || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (result.requires2fa && result.pendingToken) {
        setPendingToken(result.pendingToken);
      } else {
        navigate(redirectTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify2fa = async () => {
    if (!pendingToken || code.length < 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verify2fa(pendingToken, code);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
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
          <button
            onClick={handleVerify2fa}
            disabled={code.length < 6 || submitting}
            className="w-full rounded-lg bg-accent px-3 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
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
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {t("auth.email")}
          </label>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("auth.password")}
            </label>
            <Link to="/forgot-password" className="text-xs text-accent hover:underline">
              {t("auth.login.forgot")}
            </Link>
          </div>
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
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!email || !password || submitting}
          className="w-full rounded-lg bg-accent px-3 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>

        <SsoButtons next={redirectTo} />
      </div>
    </AuthLayout>
  );
}
