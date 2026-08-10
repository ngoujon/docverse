import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import AuthLayout from "../components/AuthLayout";
import { usePageTitle } from "../hooks/usePageTitle";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  usePageTitle(`${t("auth.login.title")} - Open RAG`);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
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
      </div>
    </AuthLayout>
  );
}
