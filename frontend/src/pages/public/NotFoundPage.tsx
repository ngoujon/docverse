import { Link } from "../../router";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "../../hooks/usePageMeta";
import PublicPageLayout from "../../components/layout/PublicPageLayout";
import { pageTitle } from "../../brand";

/** Catch-all route. nginx serves its prerendered copy (dist/404.html) with a
 * real 404 status for any path the app doesn't know, so crawlers stop seeing
 * a homepage clone (soft 404). No canonical: an error page has no URL of
 * its own worth pointing at. */
export default function NotFoundPage() {
  const { t } = useTranslation();

  usePageMeta({ title: pageTitle(t("notFound.title")), description: t("notFound.subtitle"), noindex: true });

  return (
    <PublicPageLayout
      backLabel={t("notFound.back")}
      eyebrow={t("notFound.eyebrow")}
      title={t("notFound.title")}
      subtitle={t("notFound.subtitle")}
    >
      <Link
        to="/"
        className="mt-8 inline-flex items-center rounded-lg bg-fluent-indigo px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-fluent-navy"
      >
        {t("notFound.back")}
      </Link>
    </PublicPageLayout>
  );
}
