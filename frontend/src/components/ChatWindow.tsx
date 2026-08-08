import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Globe, PanelRight, Sparkles, Menu, Loader2 } from "lucide-react";
import clsx from "clsx";
import type { Conversation, Message, Space } from "../types";
import MessageBubble from "./MessageBubble";

interface Props {
  space: Space;
  conversation: Conversation | null;
  messages: Message[];
  streaming: boolean;
  queuedPosition?: number | null;
  onSend: (text: string) => void;
  webSearch: boolean;
  onToggleWebSearch: (v: boolean) => void;
  onToggleDocPanel: () => void;
  docPanelOpen: boolean;
  onOpenMobileNav?: () => void;
}

export default function ChatWindow({
  space,
  conversation,
  messages,
  streaming,
  queuedPosition,
  onSend,
  webSearch,
  onToggleWebSearch,
  onToggleDocPanel,
  docPanelOpen,
  onOpenMobileNav,
}: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setInput("");
  }, [conversation?.id]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;
    onSend(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-slate-600">
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            className="absolute left-3 top-3 rounded-lg border border-surface-border p-2 text-slate-500 md:hidden"
          >
            <Menu size={16} />
          </button>
        )}
        <Sparkles size={28} />
        <p className="text-sm">{t("app.chat.selectConversation")}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onOpenMobileNav}
            className="shrink-0 rounded-lg border border-surface-border p-1.5 text-slate-500 hover:text-slate-700 md:hidden"
          >
            <Menu size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">{conversation.title}</h1>
            <p className="truncate text-[11px] text-slate-500">{t("app.chat.space", { name: space.name })}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => onToggleWebSearch(!webSearch)}
            title={t("app.chat.webSearchTitle")}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors sm:px-3",
              webSearch
                ? "border-accent bg-accent/10 text-accent shadow-neon-light"
                : "border-surface-border text-slate-500 hover:border-slate-400"
            )}
          >
            <Globe size={13} />
            <span className="hidden sm:inline">{t("app.chat.webSearch")}</span>
          </button>
          <button
            onClick={onToggleDocPanel}
            title={t("app.chat.documentsTitle")}
            className={clsx(
              "rounded-lg border border-surface-border p-2 text-slate-500 hover:border-slate-400 hover:text-slate-700",
              docPanelOpen && "border-accent text-accent"
            )}
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm text-center text-sm text-slate-500">
            <Sparkles size={22} className="mx-auto mb-2 text-slate-300" />
            {t("app.chat.emptyHint")}
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {streaming && queuedPosition !== null && queuedPosition !== undefined && (
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-surface-border bg-surface-2 px-3 py-1.5 text-xs text-slate-500">
            <Loader2 size={13} className="animate-spin" />
            {t("app.chat.queued")}
            {queuedPosition > 1 ? t("app.chat.queuedPosition", { count: queuedPosition - 1 }) : ""}
            {t("app.chat.queuedSuffix")}
          </div>
        )}
      </div>

      <div className="border-t border-surface-border p-2.5 sm:p-3">
        <div className="flex items-end gap-2 rounded-xl border border-surface-border bg-surface-1 px-3 py-2 focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={t("app.chat.placeholder")}
            className="max-h-40 flex-1 resize-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:bg-accent-hover disabled:opacity-30"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
