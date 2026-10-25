import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info } from "lucide-react";
import { usePageMeta } from "../../hooks/usePageMeta";
import PublicPageLayout from "../../components/layout/PublicPageLayout";
import DemoTour from "../../components/demo/DemoTour";
import DemoWorkspace from "../../components/demo/DemoWorkspace";
import type { StepIndex } from "../../components/demo/types";
import { pageTitle } from "../../brand";

/**
 * Interactive, fully offline product demo: a scripted copy of the
 * workspace (spaces, cited answers, source viewer, upload, sharing) driven
 * by a guided tour. No backend call, no file ever leaves the browser.
 */
export default function DemoPage() {
  const { t } = useTranslation();
  const [done, setDone] = useState<Set<StepIndex>>(() => new Set());
  const [pointAt, setPointAt] = useState<StepIndex | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);

  usePageMeta({
    title: pageTitle(t("demoPage.title")),
    description: t("demoPage.subtitle"),
    canonicalPath: "/demo/",
  });

  const markDone = (step: StepIndex) => {
    setDone((prev) => (prev.has(step) ? prev : new Set(prev).add(step)));
    setPointAt((p) => (p === step ? null : p));
  };

  const show = (step: StepIndex) => {
    setPointAt(step);
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const restart = () => {
    setDone(new Set());
    setPointAt(null);
    setResetKey((k) => k + 1);
  };

  return (
    <PublicPageLayout
      backLabel={t("demoPage.back")}
      eyebrow={t("demoPage.eyebrow")}
      title={t("demoPage.title")}
      subtitle={t("demoPage.subtitle")}
      width="max-w-6xl"
      subtitleClassName="mt-4 max-w-3xl text-pretty leading-relaxed text-fluent-text sm:text-[17px]"
    >
      <div className="mt-8">
        <DemoTour done={done} onShow={show} onRestart={restart} />
      </div>

      <div ref={workspaceRef} className="mt-4 scroll-mt-6">
        <DemoWorkspace done={done} onStep={markDone} pointAt={pointAt} resetKey={resetKey} />
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs text-fluent-muted">
        <Info size={13} className="mt-px shrink-0" />
        {t("demoPage.banner")}
      </p>

      <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-xl bg-fluent-navy p-8 sm:flex-row sm:items-center sm:p-10">
        <div>
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {t("demoPage.ctaTitle")}
          </h2>
          <p className="mt-2 max-w-xl text-pretty text-[#adbdcc]">{t("demoPage.ctaText")}</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:shrink-0 lg:flex-nowrap">
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fluent-indigo px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-white hover:text-fluent-navy"
          >
            {t("demoPage.ctaButton")} <ArrowRight size={15} />
          </Link>
          <Link
            to="/#contact"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 px-5 py-2.5 text-[15px] font-semibold text-white transition hover:border-white/50"
          >
            {t("demoPage.ctaSecondary")}
          </Link>
        </div>
      </div>
    </PublicPageLayout>
  );
}
