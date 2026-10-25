import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  FileSearch,
  Loader2,
  MessagesSquare,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Upload,
  User,
  Files,
  Layers,
} from "lucide-react";
import clsx from "clsx";
import { BrandMark } from "../ui/BrandLogo";
import { BRAND } from "../../brand";
import DemoAnswer from "./DemoAnswer";
import DemoDocIcon from "./DemoDocIcon";
import DemoSharePanel from "./DemoSharePanel";
import {
  STEP,
  type DemoMessage,
  type DemoQA,
  type DemoSource,
  type DemoSpace,
  type StepIndex,
  type UploadState,
} from "./types";

type MobileTab = "spaces" | "chat" | "docs";

interface SpaceState {
  messages: DemoMessage[];
  upload: UploadState;
  /** 0-100 while uploading, then the number of chunks indexed so far. */
  progress: number;
}

const emptySpace = (): SpaceState => ({ messages: [], upload: "idle", progress: 0 });

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Best scripted answer for a typed question, by keyword hits (or null). */
function matchQuestion(text: string, candidates: DemoQA[]): DemoQA | null {
  const q = normalize(text);
  let best: DemoQA | null = null;
  let bestScore = 0;
  for (const qa of candidates) {
    if (normalize(qa.q) === q) return qa;
    const score = qa.keywords.filter((k) => q.includes(k)).length;
    if (score > bestScore) {
      best = qa;
      bestScore = score;
    }
  }
  return best;
}

/** Which area the tour's "show me" button points at, per step. */
const STEP_TARGET: Record<StepIndex, { area: "spaces" | "chat" | "source" | "docs" | "share"; tab: MobileTab }> = {
  [STEP.space]: { area: "spaces", tab: "spaces" },
  [STEP.ask]: { area: "chat", tab: "chat" },
  [STEP.source]: { area: "source", tab: "chat" },
  [STEP.upload]: { area: "docs", tab: "docs" },
  [STEP.share]: { area: "share", tab: "chat" },
};

/**
 * Fully offline, scripted copy of the workspace: switch spaces, ask
 * questions (suggested or typed), open cited passages, "upload" a document
 * and open the sharing dialog. Every action ticks a step of the guided tour.
 */
export default function DemoWorkspace({
  done,
  onStep,
  pointAt,
  resetKey,
}: {
  done: Set<StepIndex>;
  onStep: (step: StepIndex) => void;
  /** Step whose target area should pulse ("show me" in the tour). */
  pointAt: StepIndex | null;
  /** Changing it resets the whole demo. */
  resetKey: number;
}) {
  const { t } = useTranslation();
  const spaces = t("demoApp.spaces", { returnObjects: true }) as DemoSpace[];

  const [active, setActive] = useState(0);
  const [states, setStates] = useState<SpaceState[]>(() => spaces.map(emptySpace));
  const [source, setSource] = useState<{ space: number; src: DemoSource } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [shareOpen, setShareOpen] = useState(false);
  const [input, setInput] = useState("");
  const timers = useRef<number[]>([]);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const space = spaces[active];
  const state = states[active] ?? emptySpace();
  const docs = state.upload === "ready" ? [...space.docs, space.upload.doc] : space.docs;
  const busy = state.messages.some((m) => m.role === "assistant" && m.phase !== "done");
  const askable = state.upload === "ready" ? [...space.qa, space.upload.qa] : space.qa;
  const asked = new Set(state.messages.flatMap((m) => (m.role === "user" ? [m.text] : [])));
  const lastAnswer = [...state.messages].reverse().find((m) => m.role === "assistant" && m.qa);
  const citedDocs = new Set(lastAnswer?.role === "assistant" ? lastAnswer.qa?.sources.map((s) => s.doc) : []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Full reset when the parent asks for it (tour "restart").
  useEffect(() => {
    if (resetKey === 0) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActive(0);
    setStates(spaces.map(emptySpace));
    setSource(null);
    setShareOpen(false);
    setInput("");
    setMobileTab("chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // "Show me" also brings the right panel into view on phones.
  useEffect(() => {
    if (pointAt !== null) setMobileTab(STEP_TARGET[pointAt].tab);
  }, [pointAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages]);

  const patchSpace = (index: number, patch: (s: SpaceState) => SpaceState) =>
    setStates((prev) => prev.map((s, i) => (i === index ? patch(s) : s)));

  const patchMessage = (index: number, id: number, patch: Partial<DemoMessage>) =>
    patchSpace(index, (s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? ({ ...m, ...patch } as DemoMessage) : m)),
    }));

  const selectSpace = (i: number) => {
    setActive(i);
    setSource(null);
    setMobileTab("chat");
    onStep(STEP.space);
  };

  const ask = (text: string, qa: DemoQA | null) => {
    if (busy || !text.trim()) return;
    const index = active;
    const answer = qa?.answer ?? t("demoApp.ui.fallback", { space: space.name });
    const userId = ++idRef.current;
    const botId = ++idRef.current;
    patchSpace(index, (s) => ({
      ...s,
      messages: [
        ...s.messages,
        { id: userId, role: "user", text: text.trim() },
        { id: botId, role: "assistant", phase: "searching", qa, text: answer, shown: 0 },
      ],
    }));
    setInput("");
    setMobileTab("chat");
    onStep(STEP.ask);

    // Retrieval steps first, then the answer is "typed" word by word.
    later(() => patchMessage(index, botId, { phase: qa ? "found" : "writing" }), 900);
    const total = answer.split(" ").length;
    const start = qa ? 1700 : 1000;
    const step = Math.max(18, Math.min(45, 1600 / total));
    for (let w = 1; w <= total; w++) {
      later(() => patchMessage(index, botId, { phase: "writing", shown: w }), start + w * step);
    }
    later(() => patchMessage(index, botId, { phase: "done" }), start + total * step + 50);
  };

  const openSource = (qa: DemoQA, n: number) => {
    const src = qa.sources[n - 1];
    if (!src) return;
    setSource({ space: active, src });
    setMobileTab("docs");
    onStep(STEP.source);
  };

  const startUpload = () => {
    if (state.upload !== "idle") return;
    const index = active;
    const chunks = space.upload.doc.chunks;
    patchSpace(index, (s) => ({ ...s, upload: "uploading", progress: 0 }));
    for (let p = 1; p <= 10; p++) later(() => patchSpace(index, (s) => ({ ...s, progress: p * 10 })), p * 110);
    later(() => patchSpace(index, (s) => ({ ...s, upload: "indexing", progress: 0 })), 1250);
    for (let c = 1; c <= chunks; c++) {
      later(() => patchSpace(index, (s) => ({ ...s, progress: c })), 1250 + c * Math.round(1400 / chunks));
    }
    later(() => {
      patchSpace(index, (s) => ({ ...s, upload: "ready" }));
      onStep(STEP.upload);
    }, 2800);
  };

  const openShare = () => {
    setShareOpen(true);
    onStep(STEP.share);
  };

  const pulse = (area: string) =>
    pointAt !== null && STEP_TARGET[pointAt].area === area && !done.has(pointAt) ? "demo-pulse" : "";

  const sourceDoc = source ? (source.space === active ? docs : spaces[source.space].docs)[source.src.doc] : null;

  // --- Panels ---------------------------------------------------------------

  const spacesPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-fluent-muted">{t("demoApp.ui.spaces")}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded-md text-fluent-muted" aria-hidden="true">
          <Plus size={15} />
        </span>
      </div>
      <div className={clsx("mx-2 space-y-1 rounded-lg p-1", pulse("spaces"))}>
        {spaces.map((s, i) => (
          <button
            key={s.name}
            onClick={() => selectSpace(i)}
            className={clsx(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition",
              i === active ? "bg-white shadow-card ring-1 ring-fluent-line" : "hover:bg-white/70",
            )}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: s.color }}
            >
              {s.short}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug text-fluent-navy">{s.name}</span>
              <span className="block truncate text-xs text-fluent-muted">
                {t("demoApp.ui.docCount", {
                  count: s.docs.length + (states[i]?.upload === "ready" ? 1 : 0),
                })}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-auto border-t border-fluent-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fluent-indigo-soft text-xs font-semibold text-fluent-indigo-dark">
            CM
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fluent-navy">Camille Martin</span>
            <span className="block truncate text-xs text-fluent-muted">{t("demoApp.ui.roleOwner")}</span>
          </span>
        </div>
      </div>
    </div>
  );

  const chatPanel = (
    <div className="flex h-full min-w-0 flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-fluent-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{ backgroundColor: space.color }}
          >
            {space.short}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fluent-navy">{space.name}</p>
            <p className="truncate text-xs text-fluent-muted">{space.desc}</p>
          </div>
        </div>
        <button
          onClick={openShare}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-lg border border-fluent-line bg-white px-3 py-1.5 text-sm font-semibold text-fluent-navy shadow-card transition hover:border-slate-300",
            pulse("share"),
          )}
        >
          <Share2 size={14} /> <span className="hidden sm:inline">{t("demoApp.ui.share")}</span>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto bg-fluent-soft/60 px-3 py-5 sm:px-5">
        {state.messages.length === 0 && (
          <div className="mx-auto mt-6 max-w-sm text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-fluent-indigo-soft text-fluent-indigo">
              <Sparkles size={20} />
            </span>
            <p className="mt-3 text-balance font-semibold text-fluent-navy">
              {t("demoApp.ui.emptyTitle", { space: space.name })}
            </p>
            <p className="mt-1 text-sm text-fluent-text">{t("demoApp.ui.emptyText")}</p>
          </div>
        )}

        {state.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end gap-2.5 animate-fade-in">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-fluent-indigo px-4 py-2.5 text-sm text-white">
                {m.text}
              </div>
              <span className="mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fluent-indigo-soft text-fluent-indigo sm:flex">
                <User size={14} />
              </span>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5 animate-fade-in">
              <BrandMark className="mt-0.5 h-7 w-7" />
              <div className="min-w-0 max-w-[90%] space-y-2 sm:max-w-[85%]">
                {(m.phase === "searching" || m.phase === "found") && (
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-fluent-line bg-white px-4 py-2.5 text-sm text-fluent-text shadow-card">
                    {m.phase === "searching" ? (
                      <>
                        <Search size={14} className="animate-pulse text-fluent-indigo" />
                        {t("demoApp.ui.searching", { count: docs.length })}
                      </>
                    ) : (
                      <>
                        <FileSearch size={14} className="text-fluent-green" />
                        {t("demoApp.ui.found", { count: m.qa?.sources.length ?? 0 })}
                      </>
                    )}
                  </div>
                )}
                {(m.phase === "writing" || m.phase === "done") && (
                  <div className="rounded-2xl rounded-tl-sm border border-fluent-line bg-white px-4 py-3 text-sm leading-relaxed text-fluent-navy shadow-card">
                    {m.qa ? (
                      <DemoAnswer
                        text={m.text}
                        words={m.phase === "writing" ? m.shown : undefined}
                        onCite={(n) => openSource(m.qa!, n)}
                      />
                    ) : (
                      m.text
                        .split(" ")
                        .slice(0, m.phase === "writing" ? m.shown : undefined)
                        .join(" ")
                    )}
                    {m.phase === "writing" && (
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse2 rounded-sm bg-fluent-indigo align-middle" />
                    )}
                  </div>
                )}
                {m.phase === "done" && m.qa && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.qa.sources.map((s, i) => {
                      const doc = docs[s.doc];
                      return (
                        <button
                          key={i}
                          onClick={() => openSource(m.qa!, i + 1)}
                          className={clsx(
                            "flex max-w-full items-center gap-1.5 rounded-full border border-fluent-line bg-white py-1 pl-1 pr-2.5 text-xs text-fluent-text shadow-card transition hover:border-fluent-indigo hover:text-fluent-indigo",
                            i === 0 && pulse("source"),
                          )}
                        >
                          <span className="cite-badge !m-0">{i + 1}</span>
                          <span className="truncate font-medium">{doc?.name}</span>
                          <span className="shrink-0 text-fluent-muted">· {s.where}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="border-t border-fluent-line bg-white p-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fluent-muted">
          {t("demoApp.ui.suggested")}
        </p>
        {/* Wrapped on desktop; one swipeable row on phones. */}
        <div className="-mx-3 mb-2.5 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
          {askable.map((qa) => {
            const isNew = qa === space.upload.qa;
            const wasAsked = asked.has(qa.q);
            return (
              <button
                key={qa.q}
                onClick={() => ask(qa.q, qa)}
                disabled={busy}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                  isNew
                    ? "border-fluent-indigo/40 bg-fluent-indigo-soft text-fluent-indigo-dark hover:border-fluent-indigo"
                    : "border-fluent-line bg-white text-fluent-navy hover:border-fluent-indigo hover:text-fluent-indigo",
                  wasAsked && "text-fluent-muted",
                  pulse("chat"),
                )}
              >
                {isNew && (
                  <span className="rounded-full bg-fluent-indigo px-1.5 text-[10px] font-bold text-white">
                    {t("demoApp.ui.newBadge")}
                  </span>
                )}
                {wasAsked && <Check size={12} className="text-fluent-green" />}
                {qa.q}
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input, matchQuestion(input, askable));
          }}
          className="flex items-center gap-2 rounded-xl border border-fluent-line bg-white py-1.5 pl-3.5 pr-1.5 shadow-card transition focus-within:border-fluent-indigo focus-within:shadow-focus"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 200))}
            placeholder={t("demoApp.ui.placeholder")}
            className="min-w-0 flex-1 bg-transparent py-1 text-sm text-fluent-navy outline-none placeholder:text-slate-400"
            aria-label={t("demoApp.ui.placeholder")}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t("demoApp.ui.send")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fluent-indigo text-white transition hover:bg-fluent-navy disabled:opacity-30"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
          </button>
        </form>
      </div>
    </div>
  );

  const docsPanel =
    source && sourceDoc ? (
      <div className="flex h-full flex-col animate-fade-in">
        <div className="flex items-center gap-2 border-b border-fluent-line px-4 py-3">
          <button
            onClick={() => setSource(null)}
            className="flex items-center gap-1.5 text-sm font-semibold text-fluent-indigo hover:text-fluent-navy"
          >
            <ArrowLeft size={15} /> {t("demoApp.ui.backToDocs")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fluent-muted">
            <Quote size={12} /> {t("demoApp.ui.sourceTitle")}
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            <DemoDocIcon type={sourceDoc.type} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fluent-navy">{sourceDoc.name}</p>
              <p className="text-xs text-fluent-muted">{source.src.where}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-fluent-line bg-white p-4 text-sm leading-relaxed text-fluent-text shadow-card">
            {(() => {
              const { passage, highlight } = source.src;
              const at = passage.indexOf(highlight);
              if (at < 0) return passage;
              return (
                <>
                  {passage.slice(0, at)}
                  <mark className="rounded bg-[#ffe9a8] px-0.5 text-fluent-navy">{highlight}</mark>
                  {passage.slice(at + highlight.length)}
                </>
              );
            })()}
          </div>
          <p className="mt-3 text-xs text-fluent-muted">{t("demoApp.ui.openInDoc", { name: sourceDoc.name })}</p>
        </div>
      </div>
    ) : (
      <div className="flex h-full flex-col">
        <div className="px-4 pb-2 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fluent-muted">{t("demoApp.ui.documents")}</p>
        </div>
        <div className="px-3">
          <button
            onClick={startUpload}
            disabled={state.upload !== "idle"}
            className={clsx(
              "flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition",
              state.upload === "idle"
                ? "border-fluent-line bg-white text-fluent-navy hover:border-fluent-indigo hover:bg-fluent-indigo-soft/40"
                : "cursor-default border-fluent-line bg-white/60 text-fluent-muted",
              pulse("docs"),
            )}
          >
            {state.upload === "idle" ? (
              <>
                <Upload size={18} className="text-fluent-indigo" />
                <span className="text-sm font-semibold">{t("demoApp.ui.upload")}</span>
                <span className="text-xs text-fluent-muted">{space.upload.doc.name}</span>
              </>
            ) : (
              <>
                <Check size={18} className="text-fluent-green" />
                <span className="text-xs">{space.upload.doc.name}</span>
              </>
            )}
          </button>
        </div>
        <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {state.upload === "uploading" || state.upload === "indexing" ? (
            <li className="rounded-lg border border-fluent-indigo/30 bg-white p-2.5 shadow-card animate-fade-in">
              <div className="flex items-center gap-2.5">
                <DemoDocIcon type={space.upload.doc.type} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fluent-navy">
                  {space.upload.doc.name}
                </span>
                <Loader2 size={14} className="animate-spin text-fluent-indigo" />
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fluent-soft">
                <div
                  className="h-full rounded-full bg-fluent-indigo transition-all duration-150"
                  style={{
                    width: `${state.upload === "uploading" ? state.progress : (state.progress / space.upload.doc.chunks) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-fluent-muted">
                {state.upload === "uploading"
                  ? `${t("demoApp.ui.uploading")} ${state.progress} %`
                  : t("demoApp.ui.indexing", { count: state.progress })}
              </p>
            </li>
          ) : null}
          {/* The freshly uploaded document (last index) is listed first. */}
          {docs
            .map((d, i) => ({ d, i }))
            .sort((a, b) => (b.i === space.docs.length ? 1 : 0) - (a.i === space.docs.length ? 1 : 0))
            .map(({ d, i }) => {
              const isNew = i === space.docs.length;
              return (
                <li
                  key={d.name}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-lg border bg-white p-2.5 transition",
                    citedDocs.has(i) ? "border-fluent-indigo/50 shadow-card" : "border-fluent-line",
                    isNew && "animate-fade-in",
                  )}
                >
                  <DemoDocIcon type={d.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fluent-navy">{d.name}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fluent-muted">
                      <span className="inline-flex items-center gap-1 text-fluent-green">
                        <Check size={11} /> {t("demoApp.ui.ready", { count: d.chunks })}
                      </span>
                      {d.size && <span>· {d.size}</span>}
                      {d.type === "audio" && <span>· {t("demoApp.ui.audioNote")}</span>}
                      {d.type === "image" && <span>· {t("demoApp.ui.visionNote")}</span>}
                    </p>
                  </div>
                  {isNew && (
                    <span className="rounded-full bg-fluent-indigo px-2 py-0.5 text-[10px] font-bold text-white">
                      {t("demoApp.ui.newBadge")}
                    </span>
                  )}
                </li>
              );
            })}
        </ul>
      </div>
    );

  // --- Layout ---------------------------------------------------------------

  const tabs: { key: MobileTab; label: string; icon: typeof Layers }[] = [
    { key: "spaces", label: t("demoApp.ui.spaces"), icon: Layers },
    { key: "chat", label: t("demoApp.ui.chat"), icon: MessagesSquare },
    { key: "docs", label: t("demoApp.ui.documents"), icon: Files },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-fluent-line bg-white shadow-card-lg">
      {/* Browser-like title bar */}
      <div className="flex items-center gap-3 border-b border-fluent-line bg-fluent-soft px-3 py-2 sm:px-4">
        <div className="hidden w-28 gap-1.5 sm:flex" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex min-w-0 max-w-sm flex-1 items-center justify-center gap-2 rounded-md bg-white px-3 py-1 text-xs text-fluent-muted ring-1 ring-fluent-line">
          <BrandMark className="h-3.5 w-3.5" />
          <span className="truncate">{BRAND.domain}/app</span>
        </div>
        <div className="flex justify-end sm:w-28">
          <button
            onClick={() => {
              timers.current.forEach(clearTimeout);
              timers.current = [];
              patchSpace(active, () => emptySpace());
              setSource(null);
            }}
            className="flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-xs font-medium text-fluent-muted transition hover:text-fluent-navy"
            title={t("demoApp.ui.reset")}
          >
            <RotateCcw size={12} /> <span className="hidden sm:inline">{t("demoApp.ui.reset")}</span>
          </button>
        </div>
      </div>

      {/* Phone: one panel at a time behind a segmented control */}
      <div className="flex gap-1 border-b border-fluent-line bg-white p-1.5 lg:hidden" role="tablist">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={mobileTab === key}
            onClick={() => {
              // Tapping "Documents" again leaves the cited passage for the list.
              if (key === "docs" && mobileTab === "docs") setSource(null);
              setMobileTab(key);
            }}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition",
              mobileTab === key ? "bg-fluent-navy text-white" : "text-fluent-text",
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* minmax(0, 1fr) keeps the nowrap suggestion row from widening the
          single phone column past the screen. */}
      <div className="grid h-[600px] grid-cols-[minmax(0,1fr)] lg:h-[640px] lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        <aside
          className={clsx(
            "min-h-0 border-fluent-line bg-fluent-soft lg:block lg:border-r",
            mobileTab === "spaces" ? "block" : "hidden",
          )}
        >
          {spacesPanel}
        </aside>
        <section className={clsx("min-h-0 lg:block", mobileTab === "chat" ? "block" : "hidden")}>{chatPanel}</section>
        <aside
          className={clsx(
            "min-h-0 border-fluent-line bg-fluent-soft lg:block lg:border-l",
            mobileTab === "docs" ? "block" : "hidden",
          )}
        >
          {docsPanel}
        </aside>
      </div>

      {shareOpen && <DemoSharePanel space={space} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
