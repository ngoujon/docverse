import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MailCheck } from "lucide-react";
import { api } from "../../api/client";
import { usePageMeta } from "../../hooks/usePageMeta";
import AuthLayout from "../../components/auth/AuthLayout";
import { buttonPrimaryWide, Field, inputClass } from "../../components/ui/controls";
import { pageTitle } from "../../brand";

/** Requests a password-reset email. The answer is the same whether or not
 * the address has an account, so the form can't be used to probe emails. */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  usePageMeta({ title: pageTitle(t("auth.forgot.title")), description: t("auth.forgot.subtitle"), noindex: true });

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email || submitting) return;
    setSubmitting(true);
    try {
      await api.forgotPassword(email);
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  const backToLogin = (
    <Link to="/login" className="font-medium text-accent hover:underline">
      {t("auth.forgot.backToLogin")}
    </Link>
  );

  if (sent) {
    return (
      <AuthLayout title={t("auth.forgot.title")}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <MailCheck size={28} className="text-accent" />
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("auth.forgot.sent")}</p>
          <Link to="/login" className="mt-2 text-sm font-medium text-accent hover:underline">
            {t("auth.forgot.backToLogin")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")} footer={backToLogin}>
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
        <button onClick={handleSubmit} disabled={!email || submitting} className={buttonPrimaryWide}>
          {submitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
        </button>
      </div>
    </AuthLayout>
  );
}
