import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { api } from "../../api/client";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { usePageMeta } from "../../hooks/usePageMeta";
import AuthLayout from "../../components/auth/AuthLayout";
import PasswordStrengthMeter from "../../components/ui/PasswordStrengthMeter";
import { buttonPrimaryWide, Field, PasswordInput } from "../../components/ui/controls";
import { pageTitle } from "../../brand";

/** Landing page of the password-reset email link (?token=...). */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  usePageMeta({ title: pageTitle(t("auth.reset.title")), noindex: true });

  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy: submitting, error, run } = useAsyncAction();

  const handleSubmit = () => {
    if (!token || password.length < 8 || submitting) return;
    run(async () => {
      await api.resetPassword(token, password);
      setDone(true);
    });
  };

  if (!token) {
    return (
      <AuthLayout title={t("auth.reset.title")}>
        <p className="text-sm text-red-500">{t("auth.reset.missingToken")}</p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title={t("auth.reset.title")}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 size={28} className="text-emerald-500" />
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("auth.reset.success")}</p>
          <button
            onClick={() => navigate("/login")}
            className="mt-2 rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
          >
            {t("auth.reset.goToLogin")}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      subtitle={t("auth.reset.subtitle")}
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      <div className="space-y-3">
        <Field label={t("auth.reset.newPassword")}>
          <PasswordInput autoFocus value={password} onChange={setPassword} onEnter={handleSubmit} />
          <PasswordStrengthMeter password={password} />
        </Field>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button onClick={handleSubmit} disabled={password.length < 8 || submitting} className={buttonPrimaryWide}>
          {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
        </button>
      </div>
    </AuthLayout>
  );
}
