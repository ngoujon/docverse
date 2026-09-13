import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import AuthLayout from "../components/AuthLayout";
import { usePageMeta } from "../hooks/usePageMeta";
import { pageTitle } from "../brand";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  usePageMeta({ title: pageTitle(t("auth.verify.title")), noindex: true });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => {
        setStatus("ok");
        refresh();
      })
      .catch(() => setStatus("error"));
  }, [token, refresh]);

  return (
    <AuthLayout title={t("auth.verify.title")}>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {status === "loading" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("auth.verify.verifying")}</p>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">{t("auth.verify.success")}</p>
            <Link
              to="/dashboard"
              className="mt-2 rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
            >
              {t("auth.verify.goToDashboard")}
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={28} className="text-red-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">{t("auth.verify.error")}</p>
          </>
        )}
        <Link to="/" className="mt-2 text-sm font-medium text-accent hover:underline">
          {t("newsletter.backHome")}
        </Link>
      </div>
    </AuthLayout>
  );
}
