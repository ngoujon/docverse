import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { usePageMeta } from "../../hooks/usePageMeta";
import AuthLayout, { TokenStatus } from "../../components/auth/AuthLayout";
import { pageTitle } from "../../brand";

/** Landing page of the "confirm your email" link (?token=...). */
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
        refresh(); // the "email not verified" banner must disappear
      })
      .catch(() => setStatus("error"));
  }, [token, refresh]);

  return (
    <AuthLayout title={t("auth.verify.title")}>
      <TokenStatus
        status={status}
        loadingText={t("auth.verify.verifying")}
        successText={t("auth.verify.success")}
        errorText={t("auth.verify.error")}
        successAction={
          <Link
            to="/dashboard"
            className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-neon-light hover:bg-accent-hover"
          >
            {t("auth.verify.goToDashboard")}
          </Link>
        }
      />
    </AuthLayout>
  );
}
