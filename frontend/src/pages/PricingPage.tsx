import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Gauge } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";
import { useJsonLd } from "../hooks/useJsonLd";
import { useAuth } from "../hooks/useAuth";
import { pageTitle, BRAND } from "../brand";

export default function PricingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const limits = t("pricing.limits", { returnObjects: true }) as string[];
  const features = t("pricing.features", { returnObjects: true }) as string[];

  usePageMeta({
    title: pageTitle(t("pricing.title")),
    description: t("pricing.subtitle"),
    canonicalPath: "/tarifs",
  });

  useJsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: BRAND.name,
    description: t("pricing.subtitle"),
    offers: {
      "@type": "Offer",
      name: t("pricing.planName"),
      price: "0",
      priceCurrency: "EUR",
      description: t("pricing.tagline"),
      url: `https://${BRAND.domain}/tarifs`,
    },
  });

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {t("common.backHome")}
        </Link>

        <div className="mx-auto max-w-xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
            {t("pricing.eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{t("pricing.title")}</h1>
          <p className="mt-3 text-sm text-slate-600">{t("pricing.subtitle")}</p>
        </div>

        <div className="mt-12 rounded-2xl border border-retro-pink bg-retro-panel/60 p-6 shadow-neon-light sm:p-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-retro-pink">
                {t("pricing.planName")}
              </h2>
              <p className="mt-1 text-xs text-slate-600">{t("pricing.tagline")}</p>
            </div>
            <div className="mt-3 flex items-baseline gap-1 sm:mt-0">
              <span className="text-3xl font-extrabold text-slate-900">0€</span>
              <span className="text-xs text-slate-500">{t("pricing.period")}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                {t("pricing.featuresTitle")}
              </p>
              <ul className="mt-3 space-y-2.5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-700">
                    <Check size={14} className="mt-0.5 shrink-0 text-retro-cyan" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                {t("pricing.limitsTitle")}
              </p>
              <ul className="mt-3 space-y-2.5">
                {limits.map((l) => (
                  <li key={l} className="flex items-start gap-2 text-xs text-slate-700">
                    <Gauge size={14} className="mt-0.5 shrink-0 text-retro-purple" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Link
            to={user ? "/dashboard" : "/register"}
            className="mt-8 flex items-center justify-center gap-2 rounded-lg border border-retro-pink bg-retro-pink px-3 py-2.5 font-mono text-[11px] uppercase tracking-wide text-white transition hover:bg-retro-pink/90"
          >
            {user ? t("pricing.ctaLoggedIn") : t("pricing.cta")} <ArrowRight size={13} />
          </Link>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-500">{t("pricing.fairUseNote")}</p>

        <p className="mt-10 text-center text-xs text-slate-500">
          {t("pricing.faqNote")}{" "}
          <Link to="/faq" className="text-retro-cyan hover:underline">
            {t("pricing.faqLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
