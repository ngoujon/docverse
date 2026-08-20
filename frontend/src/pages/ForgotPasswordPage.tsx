import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MailCheck } from "lucide-react";
import { api } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { usePageMeta } from "../hooks/usePageMeta";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  usePageMeta({ title: `${t("auth.forgot.title")} - Hyaides`, noindex: true });

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
    <AuthLayout
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
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
        <button
          onClick={handleSubmit}
          disabled={!email || submitting}
          className="w-full rounded-lg bg-accent px-3 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
        </button>
      </div>
    </AuthLayout>
  );
}
