import { useTranslation } from "react-i18next";
import { usePageMeta } from "../../hooks/usePageMeta";
import PublicPageLayout, { LegalSection } from "../../components/layout/PublicPageLayout";
import { BRAND, pageTitle } from "../../brand";

interface Section {
  title: string;
  body: string;
}

/** Legal notice (mentions legales); publisher identity comes from the build env. */
export default function LegalNoticePage() {
  const { t } = useTranslation();
  const sections = t("legal.sections", {
    returnObjects: true,
    publisher: BRAND.legalPublisher || t("legal.notConfigured"),
    director: BRAND.legalDirector || t("legal.notConfigured"),
  }) as Section[];

  usePageMeta({
    title: pageTitle(t("legal.title")),
    description: t("legal.subtitle"),
    canonicalPath: "/mentions-legales/",
  });

  return (
    <PublicPageLayout
      backLabel={t("legal.back")}
      eyebrow={t("legal.eyebrow")}
      title={t("legal.title")}
      subtitle={t("legal.subtitle")}
    >
      <div className="mt-8 space-y-5">
        {sections.map((s) => (
          <LegalSection key={s.title} title={s.title} body={s.body} preLine />
        ))}
      </div>
    </PublicPageLayout>
  );
}
