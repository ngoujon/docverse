import { useTranslation } from "react-i18next";
import { usePageMeta } from "../../hooks/usePageMeta";
import PublicPageLayout, { LegalSection } from "../../components/layout/PublicPageLayout";
import { pageTitle } from "../../brand";

interface TermsSection {
  title: string;
  body: string;
}

/** Terms of use (CGU). Bump the date below whenever the wording changes. */
export default function TermsPage() {
  const { t } = useTranslation();
  const sections = t("terms.sections", { returnObjects: true }) as TermsSection[];

  usePageMeta({
    title: pageTitle(t("terms.title")),
    description: t("terms.subtitle"),
    canonicalPath: "/cgu/",
  });

  return (
    <PublicPageLayout
      backLabel={t("terms.back")}
      eyebrow={t("terms.eyebrow")}
      title={t("terms.title")}
      subtitle={t("terms.subtitle")}
    >
      <p className="mt-4 text-sm text-fluent-muted">{t("terms.updated", { date: "2026-08-10" })}</p>
      <div className="mt-8 space-y-5">
        {sections.map((s) => (
          <LegalSection key={s.title} title={s.title} body={s.body} />
        ))}
      </div>
    </PublicPageLayout>
  );
}
