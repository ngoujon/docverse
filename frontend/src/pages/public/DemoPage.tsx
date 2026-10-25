import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, FileText, Image, FileCode, Globe, Sparkles, RotateCcw, Info } from "lucide-react";
import { usePageMeta } from "../../hooks/usePageMeta";
import { useCaptcha } from "../../hooks/useCaptcha";
import AnimatedText from "../../components/ui/AnimatedText";
import PublicPageLayout from "../../components/layout/PublicPageLayout";
import { BrandMark } from "../../components/ui/BrandLogo";
import { BRAND, pageTitle } from "../../brand";

interface DemoDocument {
  name: string;
  type: "pdf" | "image" | "text" | "web";
}

interface DemoSuggestion {
  question: string;
  answer: string;
  sourceIndex: number;
}

interface DemoMessage {
  role: "user" | "assistant";
  content: string;
  sourceIndex?: number;
  streaming?: boolean;
}

const DOC_ICONS = { pdf: FileText, image: Image, text: FileCode, web: Globe };

/**
 * Scripted, offline product demo: canned questions with canned answers
 * "streamed" in, no backend call. Suggestions unlock once the invisible
 * proof-of-work captcha is solved, which a human never notices but makes
 * scripted spam of the page cost real CPU.
 */
export default function DemoPage() {
  const { t } = useTranslation();
  const documents = t("demoPage.documents", { returnObjects: true }) as DemoDocument[];
  const suggestions = t("demoPage.suggestions", { returnObjects: true }) as DemoSuggestion[];
  // Fails open: the demo is purely cosmetic, never block it on an error.
  const { status: captchaStatus } = useCaptcha();
  const humanVerified = captchaStatus === "ready" || captchaStatus === "error";
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [usedIndexes, setUsedIndexes] = useState<number[]>([]);

  usePageMeta({
    title: pageTitle(t("demoPage.title")),
    description: t("demoPage.subtitle"),
    canonicalPath: "/demo/",
  });

  const updateLast = (patch: Partial<DemoMessage>) =>
    setMessages((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], ...patch }]);

  const askSuggestion = (i: number) => {
    if (!humanVerified || usedIndexes.includes(i)) return;
    const s = suggestions[i];
    setUsedIndexes((prev) => [...prev, i]);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: s.question },
      { role: "assistant", content: "", sourceIndex: s.sourceIndex, streaming: true },
    ]);
    // "Typing..." for 500ms, then the answer fades in word by word for 900ms.
    setTimeout(() => {
      updateLast({ content: s.answer });
      setTimeout(() => updateLast({ streaming: false }), 900);
    }, 500);
  };

  const reset = () => {
    setMessages([]);
    setUsedIndexes([]);
  };

  return (
    <PublicPageLayout
      backLabel={t("demoPage.back")}
      eyebrow={t("demoPage.eyebrow")}
      title={t("demoPage.title")}
      subtitle={t("demoPage.subtitle")}
      width="max-w-4xl"
      subtitleClassName="mt-4 max-w-xl leading-relaxed text-fluent-text"
    >
      <div className="mt-6 flex items-start gap-2 rounded-lg bg-fluent-indigo-soft px-4 py-3 text-sm text-fluent-navy">
        <Info size={15} className="mt-0.5 shrink-0 text-fluent-indigo" />
        {t("demoPage.banner")}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[250px_1fr]">
        <div className="rounded-xl border border-fluent-line bg-white p-5 shadow-card lg:self-start">
          <p className="text-sm font-semibold text-fluent-navy">{t("demoPage.documentsTitle")}</p>
          <ul className="mt-3 space-y-2.5">
            {documents.map((doc) => {
              const Icon = DOC_ICONS[doc.type];
              return (
                <li key={doc.name} className="flex items-start gap-2 text-sm text-fluent-text">
                  <Icon size={14} className="mt-[3px] shrink-0 text-fluent-indigo" />
                  <span className="min-w-0 break-all">{doc.name}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex min-h-[340px] flex-col sm:min-h-[420px] overflow-hidden rounded-xl border border-fluent-line bg-white shadow-card-lg">
          <div className="flex items-center justify-between border-b border-fluent-line bg-fluent-soft px-4 py-2.5">
            <span className="flex items-center gap-2 text-xs font-medium text-fluent-navy">
              <BrandMark className="h-4 w-4" />
              {BRAND.name}
            </span>
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs font-medium text-fluent-muted transition hover:text-fluent-indigo"
            >
              <RotateCcw size={11} /> {t("demoPage.resetLabel")}
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="mt-4 text-center text-xs text-slate-400">{t("demoPage.inputPlaceholder")}</p>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-fluent-indigo px-3.5 py-2 text-sm text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo">
                    <Sparkles size={14} />
                  </span>
                  <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-fluent-line bg-white px-3.5 py-2.5 text-sm leading-relaxed text-fluent-navy">
                    {m.content ? (
                      <>
                        <AnimatedText text={m.content} animate={m.streaming} />
                        {m.sourceIndex !== undefined && (
                          <span className="mt-2.5 flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-fluent-indigo-soft px-2.5 py-0.5 text-[11px] font-medium text-fluent-indigo-dark">
                              <FileText size={11} /> {documents[m.sourceIndex]?.name}
                            </span>
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-fluent-muted">
                        <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-fluent-indigo" />
                        {t("demoPage.typing")}
                      </span>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="border-t border-fluent-line bg-fluent-soft p-3">
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={s.question}
                  onClick={() => askSuggestion(i)}
                  disabled={!humanVerified || usedIndexes.includes(i)}
                  className="rounded-full border border-fluent-line bg-white px-3.5 py-1.5 text-sm text-fluent-navy shadow-card transition hover:border-fluent-indigo hover:text-fluent-indigo disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {s.question}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 rounded-xl border-2 border-fluent-indigo bg-white p-8 text-center shadow-neon">
        <h2 className="text-2xl font-semibold tracking-tight text-fluent-navy">{t("demoPage.ctaTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-fluent-text">{t("demoPage.ctaText")}</p>
        <Link
          to="/app"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-fluent-indigo px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-fluent-navy"
        >
          {t("demoPage.ctaButton")} <ArrowRight size={14} />
        </Link>
      </div>
    </PublicPageLayout>
  );
}
