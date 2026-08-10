import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";

interface LegalSection {
  title: string;
  body: string;
}

export default function LegalNoticePage() {
  const { t } = useTranslation();
  const sections = t("legal.sections", { returnObjects: true }) as LegalSection[];

  usePageMeta({
    title: `${t("legal.title")} - Open RAG`,
    description: t("legal.subtitle"),
    canonicalPath: "/mentions-legales",
  });

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {t("legal.back")}
        </Link>

        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
          {t("legal.eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{t("legal.title")}</h1>
        <p className="mt-3 text-sm text-slate-600">{t("legal.subtitle")}</p>

        <div className="mt-8 space-y-5">
          {sections.map((s) => (
            <div key={s.title} className="rounded-2xl border border-retro-border bg-retro-panel/40 p-5">
              <h2 className="text-sm font-semibold text-slate-900">{s.title}</h2>
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
