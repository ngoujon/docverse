import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { usePageMeta } from "../../hooks/usePageMeta";
import AuthLayout, { TokenStatus } from "../../components/auth/AuthLayout";
import { pageTitle } from "../../brand";

/** Landing page of the newsletter double opt-in and unsubscribe links. */
export default function NewsletterConfirmPage({ mode }: { mode: "confirm" | "unsubscribe" }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  usePageMeta({ title: pageTitle(t(`newsletter.${mode}.title`)), noindex: true });

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
      <TokenStatus
        status={status}
        loadingText={t("common.loading")}
        successText={t(`newsletter.${mode}.success`)}
        errorText={t(`newsletter.${mode}.error`)}
      />
    </AuthLayout>
  );
}
