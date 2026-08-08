import { useEffect, useRef, useState } from "react";
import { Send, Globe, PanelRight, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { Conversation, Message, Space } from "../types";
import MessageBubble from "./MessageBubble";

interface Props {
  space: Space;
  conversation: Conversation | null;
  messages: Message[];
  streaming: boolean;
  onSend: (text: string) => void;
  webSearch: boolean;
  onToggleWebSearch: (v: boolean) => void;
  onToggleDocPanel: () => void;
  docPanelOpen: boolean;
}

export default function ChatWindow({
  space,
  conversation,
  messages,
  streaming,
  onSend,
  webSearch,
  onToggleWebSearch,
  onToggleDocPanel,
  docPanelOpen,
}: Props) {
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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-600">
        <Sparkles size={28} />
        <p className="text-sm">Selectionnez ou creez une conversation pour commencer.</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-100">{conversation.title}</h1>
          <p className="text-[11px] text-slate-500">Espace : {space.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleWebSearch(!webSearch)}
            title="Completer les reponses avec une recherche web"
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              webSearch
                ? "border-accent bg-accent/15 text-accent"
                : "border-surface-border text-slate-400 hover:border-slate-600"
            )}
          >
            <Globe size={13} />
            Recherche web
          </button>
          <button
            onClick={onToggleDocPanel}
            title="Documents de l'espace"
            className={clsx(
              "rounded-lg border border-surface-border p-2 text-slate-400 hover:border-slate-600 hover:text-slate-200",
              docPanelOpen && "border-accent text-accent"
            )}
          >
            <PanelRight size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm text-center text-sm text-slate-600">
            <Sparkles size={22} className="mx-auto mb-2 text-slate-700" />
            Posez une question sur les documents de cet espace. Activez la
            recherche web pour completer avec des sources en ligne.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <div className="border-t border-surface-border p-3">
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
            placeholder="Ecrivez votre message... (Entree pour envoyer, Maj+Entree pour un saut de ligne)"
            className="max-h-40 flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
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
