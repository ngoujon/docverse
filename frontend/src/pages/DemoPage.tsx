import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, FileText, Image, FileCode, Globe, Sparkles, RotateCcw, Info } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";
import { useInvisibleCaptcha } from "../hooks/useInvisibleCaptcha";
import AnimatedText from "../components/AnimatedText";
import { pageTitle } from "../brand";

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

export default function DemoPage() {
  const { t } = useTranslation();
  const documents = t("demoPage.documents", { returnObjects: true }) as DemoDocument[];
  const suggestions = t("demoPage.suggestions", { returnObjects: true }) as DemoSuggestion[];
  const humanVerified = useInvisibleCaptcha();
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [usedIndexes, setUsedIndexes] = useState<number[]>([]);

  usePageMeta({
    title: pageTitle(t("demoPage.title")),
    description: t("demoPage.subtitle"),
    canonicalPath: "/demo",
  });

  const askSuggestion = (i: number) => {
    if (!humanVerified || usedIndexes.includes(i)) return;
    const s = suggestions[i];
    setUsedIndexes((prev) => [...prev, i]);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: s.question },
      { role: "assistant", content: "", sourceIndex: s.sourceIndex, streaming: true },
    ]);
    setTimeout(() => {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: s.answer, sourceIndex: s.sourceIndex, streaming: true };
        return copy;
      });
      setTimeout(() => {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], streaming: false };
          return copy;
        });
      }, 900);
    }, 500);
  };

  const reset = () => {
    setMessages([]);
    setUsedIndexes([]);
  };

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {t("demoPage.back")}
        </Link>

        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
          {t("demoPage.eyebrow")}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{t("demoPage.title")}</h1>
        <p className="mt-3 max-w-xl text-sm text-slate-600">{t("demoPage.subtitle")}</p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-retro-border bg-retro-panel/40 px-4 py-3 text-xs text-slate-600">
          <Info size={14} className="mt-0.5 shrink-0 text-retro-cyan" />
          {t("demoPage.banner")}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="rounded-2xl border border-retro-border bg-retro-panel/40 p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
              {t("demoPage.documentsTitle")}
            </p>
            <ul className="mt-3 space-y-2">
              {documents.map((doc) => {
                const Icon = DOC_ICONS[doc.type];
                return (
                  <li key={doc.name} className="flex items-center gap-2 text-xs text-slate-700">
                    <Icon size={14} className="shrink-0 text-retro-purple" />
                    <span className="truncate">{doc.name}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-retro-border bg-retro-panel">
            <div className="flex items-center justify-between border-b border-retro-border bg-retro-bg2 px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                espace-demo.local/app
              </span>
              <button
                onClick={reset}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500 hover:text-retro-cyan"
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
                    <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-retro-purple px-3.5 py-2 text-xs text-white sm:text-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-retro-pink/15 text-retro-pink">
                      <Sparkles size={13} />
                    </span>
                    <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-retro-border bg-white px-3.5 py-2 text-xs text-slate-700 sm:text-sm">
                      {m.content ? (
                        <>
                          <AnimatedText text={m.content} animate={m.streaming} />
                          {m.sourceIndex !== undefined && (
                            <span className="mt-2 flex flex-wrap gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full border border-retro-border bg-retro-bg2 px-2 py-0.5 font-mono text-[10px] text-retro-cyan">
                                <FileText size={10} /> {documents[m.sourceIndex]?.name}
                              </span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                          <span className="inline-block h-3 w-[6px] animate-blink bg-retro-pink" />
                          {t("demoPage.typing")}
                        </span>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="border-t border-retro-border bg-retro-bg2 p-3">
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={s.question}
                    onClick={() => askSuggestion(i)}
                    disabled={!humanVerified || usedIndexes.includes(i)}
                    className="rounded-full border border-retro-border bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-retro-cyan hover:text-retro-cyan disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {s.question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-retro-pink/40 bg-retro-panel/40 p-6 text-center sm:p-8">
          <h2 className="text-lg font-bold text-slate-900">{t("demoPage.ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{t("demoPage.ctaText")}</p>
          <Link
            to="/register"
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-retro-pink bg-retro-pink px-6 py-3 font-mono text-xs uppercase tracking-wider text-white shadow-neon-light transition hover:bg-retro-pink/90"
          >
            {t("demoPage.ctaButton")} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
