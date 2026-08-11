import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { usePageMeta } from "../hooks/usePageMeta";

export default function NewsletterConfirmPage({ mode }: { mode: "confirm" | "unsubscribe" }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  usePageMeta({ title: `${t(`newsletter.${mode}.title`)} - Hyaides`, noindex: true });

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    const call = mode === "confirm" ? api.newsletterConfirm : api.newsletterUnsubscribe;
    call(token)
      .then(() => setStatus("ok"))
      .catch(() => setStatus("error"));
  }, [token, mode]);

  return (
    <AuthLayout title={t(`newsletter.${mode}.title`)}>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {status === "loading" && <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>}
        {status === "ok" && (
          <>
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">{t(`newsletter.${mode}.success`)}</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={28} className="text-red-500" />
            <p className="text-sm text-slate-600 dark:text-slate-400">{t(`newsletter.${mode}.error`)}</p>
          </>
        )}
        <Link to="/" className="mt-2 text-sm font-medium text-accent hover:underline">
          {t("newsletter.backHome")}
        </Link>
      </div>
    </AuthLayout>
  );
}
