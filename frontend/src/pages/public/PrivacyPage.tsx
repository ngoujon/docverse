import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Cookie,
  Database,
  FileWarning,
  Mail,
  Server,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { usePageMeta } from "../../hooks/usePageMeta";
import { BRAND, pageTitle } from "../../brand";
import PublicPageLayout from "../../components/layout/PublicPageLayout";
import { optOutOfAudience } from "../../utils/seoMonitor";

// One icon per section, in the order they appear in the locale files.
const SECTION_ICONS = [
  Cookie, // cookies
  Database, // localStorage
  ShieldCheck, // account and workspace data
  FileWarning, // what you upload
  Mail, // contact form
  Server, // technical providers
  Clock, // controller and retention periods
  UserCheck, // GDPR rights
];

interface PrivacySection {
  title: string;
  body: string;
}

interface AudienceSection {
  title: string;
  paragraphs: string[];
  optOutLead: string;
  optOut: string;
  optedOut: string;
  unavailable: string;
}

/** The SEO Monitor section (CNIL-exempt audience measurement), with its
 * opt-out. A React handler rather than the vendor's inline onclick, which
 * the CSP (script-src without 'unsafe-inline') would block. */
function AudienceMeasurementSection() {
  const { t } = useTranslation();
  const a = t("privacy.audience", {
    returnObjects: true,
    publisher: BRAND.legalPublisher || t("legal.notConfigured"),
  }) as AudienceSection;
  const [optOutState, setOptOutState] = useState<"idle" | "done" | "unavailable">("idle");

  return (
    <div id="mesure-audience" className="rounded-xl border border-fluent-line bg-white p-6 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo">
          <BarChart3 size={16} />
        </span>
        <h2 className="font-semibold text-fluent-navy">{a.title}</h2>
      </div>
      {a.paragraphs.map((p) => (
        <p key={p} className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fluent-text">
          {p}
        </p>
      ))}
      <p className="mt-3 text-sm leading-relaxed text-fluent-text">
        {a.optOutLead}{" "}
        {optOutState === "idle" ? (
          <button
            type="button"
            onClick={() => setOptOutState(optOutOfAudience() ? "done" : "unavailable")}
            className="font-medium text-fluent-indigo underline hover:text-fluent-navy"
          >
            {a.optOut}
          </button>
        ) : (
          <span role="status" className="font-semibold text-slate-900">
            {optOutState === "done" ? a.optedOut : a.unavailable}
          </span>
        )}
        {optOutState === "idle" && "."}
      </p>
    </div>
  );
}

/** Privacy policy (GDPR), with the audience-measurement opt-out. */
export default function PrivacyPage() {
  const { t } = useTranslation();
  const sections = t("privacy.sections", { returnObjects: true }) as PrivacySection[];

  usePageMeta({
    title: pageTitle(t("privacy.title")),
    description: t("privacy.subtitle"),
    canonicalPath: "/confidentialite/",
  });

  return (
    <PublicPageLayout
      backLabel={t("privacy.back")}
      eyebrow={t("privacy.eyebrow")}
      title={t("privacy.title")}
      subtitle={t("privacy.subtitle")}
    >
      <div className="mt-10 space-y-6">
        {sections.map((s, i) => {
          // Falls back rather than crashing the render if a section is
          // added to the locales without an icon here.
          const Icon = SECTION_ICONS[i] ?? ShieldCheck;
          return (
            <Fragment key={s.title}>
              <div className="rounded-xl border border-fluent-line bg-white p-6 shadow-card">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo">
                    <Icon size={16} />
                  </span>
                  <h2 className="font-semibold text-fluent-navy">{s.title}</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-fluent-text">{s.body}</p>
              </div>
              {/* Right after "Cookies", which points to it. */}
              {i === 0 && <AudienceMeasurementSection />}
            </Fragment>
          );
        })}
      </div>

      <Link
        to="/account"
        className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-semibold text-fluent-indigo transition hover:text-fluent-navy"
      >
        {t("privacy.rightsLinkCta")} <ArrowLeft size={12} className="rotate-180" />
      </Link>

      <p className="mt-10 text-xs text-slate-500">{t("privacy.footnote")}</p>
    </PublicPageLayout>
  );
}
