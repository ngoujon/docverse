import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";

interface SaleSection {
  title: string;
  body: string;
}

export default function TermsOfSalePage() {
  const { t } = useTranslation();
  const sections = t("sale.sections", { returnObjects: true }) as SaleSection[];

  usePageMeta({
    title: `${t("sale.title")} - Hyaides`,
    description: t("sale.subtitle"),
    canonicalPath: "/cgv",
  });

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {t("sale.back")}
        </Link>

        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
          {t("sale.eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{t("sale.title")}</h1>
        <p className="mt-3 text-sm text-slate-600">{t("sale.subtitle")}</p>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-slate-400">
          {t("sale.updated", { date: "2026-08-27" })}
        </p>

        <div className="mt-8 space-y-5">
          {sections.map((s) => (
            <div key={s.title} className="rounded-2xl border border-retro-border bg-retro-panel/40 p-5">
              <h2 className="text-sm font-semibold text-slate-900">{s.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
