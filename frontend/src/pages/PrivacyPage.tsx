import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Cookie, Database, Mail, ShieldCheck } from "lucide-react";
import { usePageTitle } from "../hooks/usePageTitle";

const SECTION_ICONS = [Cookie, Database, ShieldCheck, Mail];

interface PrivacySection {
  title: string;
  body: string;
}

export default function PrivacyPage() {
  const { t } = useTranslation();
  const sections = t("privacy.sections", { returnObjects: true }) as PrivacySection[];

  usePageTitle(`${t("privacy.title")} - Open RAG`);

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {t("privacy.back")}
        </Link>

        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
          {t("privacy.eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          {t("privacy.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{t("privacy.subtitle")}</p>

        <div className="mt-10 space-y-6">
          {sections.map((s, i) => {
            const Icon = SECTION_ICONS[i];
            return (
              <div
                key={s.title}
                className="rounded-2xl border border-retro-border bg-retro-panel/40 p-5"
              >
                <div className="flex items-center gap-2">
                  <Icon size={17} className="text-retro-cyan" />
                  <h2 className="text-sm font-semibold text-slate-900">{s.title}</h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{s.body}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-slate-500">{t("privacy.footnote")}</p>
      </div>
    </div>
  );
}
