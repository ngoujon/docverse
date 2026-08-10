import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";

interface PricingTier {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
}

const TIER_ACCENTS = ["text-slate-600", "text-retro-cyan", "text-retro-pink", "text-retro-purple"];

export default function PricingPage() {
  const { t } = useTranslation();
  const tiers = t("pricing.tiers", { returnObjects: true }) as PricingTier[];

  usePageMeta({
    title: `${t("pricing.title")} - Open RAG`,
    description: t("pricing.subtitle"),
    canonicalPath: "/tarifs",
  });

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-6xl">
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

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier, i) => {
            const isPro = i === 2;
            return (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  isPro
                    ? "border-retro-pink bg-retro-panel/60 shadow-neon"
                    : "border-retro-border bg-retro-panel/40"
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-retro-pink bg-retro-bg px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-retro-pink">
                    {t("pricing.popular")}
                  </span>
                )}
                <h2 className={`font-mono text-sm font-bold uppercase tracking-wider ${TIER_ACCENTS[i]}`}>
                  {tier.name}
                </h2>
                <p className="mt-1 text-xs text-slate-600">{tier.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  {tier.price ? (
                    <>
                      <span className="text-3xl font-extrabold text-slate-900">{tier.price}€</span>
                      {tier.period && <span className="text-xs text-slate-500">{tier.period}</span>}
                    </>
                  ) : (
                    <span className="text-xl font-bold text-slate-900">{t("pricing.customPriceLabel")}</span>
                  )}
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-700">
                      <Check size={14} className="mt-0.5 shrink-0 text-retro-cyan" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to={i === 3 ? "/#contact" : "/register"}
                  className={`mt-6 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition ${
                    isPro
                      ? "border border-retro-pink bg-retro-pink text-white hover:bg-retro-pink/90"
                      : "border border-retro-border text-slate-700 hover:border-retro-cyan hover:text-retro-cyan"
                  }`}
                >
                  {tier.cta} <ArrowRight size={13} />
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-500">{t("pricing.billingNote")}</p>

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
