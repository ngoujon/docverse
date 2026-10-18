import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useJsonLd, usePageMeta } from "../../hooks/usePageMeta";
import PublicPageLayout from "../../components/layout/PublicPageLayout";

interface FaqItem {
  question: string;
  answer: string;
}

/** FAQ accordion, also published as FAQPage structured data for search engines. */
export default function FaqPage() {
  const { t } = useTranslation();
  const items = t("faq.items", { returnObjects: true }) as FaqItem[];
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  // t("faq.title") interpole deja {{brand}} (voir locales/*.json) - le
  // passer a pageTitle() dupliquerait le nom de marque ("... - Docverse").
  usePageMeta({
    title: t("faq.title"),
    description: t("faq.subtitle"),
    canonicalPath: "/faq/",
  });

  useJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  });

  return (
    <PublicPageLayout
      backLabel={t("faq.backHome")}
      eyebrow={t("faq.eyebrow")}
      title={t("faq.title")}
      subtitle={t("faq.subtitle")}
    >
      <div className="mt-10 space-y-3">
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={item.question}
              className="overflow-hidden rounded-2xl border border-retro-border bg-retro-panel/40"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <HelpCircle size={16} className="shrink-0 text-retro-cyan" />
                <span className="flex-1 text-sm font-semibold text-slate-900">{item.question}</span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && <p className="px-5 pb-4 pl-11 text-xs leading-relaxed text-slate-600">{item.answer}</p>}
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-xs text-slate-500">{t("faq.contactCta")}</p>
    </PublicPageLayout>
  );
}
