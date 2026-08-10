import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, X } from "lucide-react";
import { streamSupportChat } from "../api/client";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function SupportChatWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEscapeToClose(open, () => setOpen(false));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const history = messages.map(({ role, content }) => ({ role, content }));
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(nextMessages);
    setStreaming(true);

    try {
      await streamSupportChat(text, history, (event) => {
        if (event.type === "token" && event.content) {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...copy[copy.length - 1],
              content: copy[copy.length - 1].content + event.content,
            };
            return copy;
          });
        }
      });
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: t("support.errorGeneric") };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("support.openLabel")}
          className="fixed bottom-4 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-retro-pink text-white shadow-[0_10px_30px_-8px_rgba(224,28,192,0.6)] transition hover:scale-105 sm:bottom-6 sm:right-6"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("support.title")}
          className="fixed inset-0 z-[60] flex flex-col bg-retro-bg sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-xl sm:border sm:border-retro-border sm:shadow-[0_20px_60px_-15px_rgba(139,47,214,0.35)]"
        >
          <div className="flex items-center gap-2 border-b border-retro-border bg-retro-bg2 px-3 py-2.5 sm:rounded-t-xl">
            <span className="h-2.5 w-2.5 rounded-full bg-retro-pink/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-retro-yellow/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-retro-cyan/70" />
            <div className="ml-2 min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                {t("support.title")}
              </p>
              <p className="truncate text-[10px] text-slate-500">{t("support.subtitle")}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("support.closeLabel")}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-black/5 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-retro-bg px-3 py-4">
            <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-retro-border bg-white px-3 py-2 text-xs text-slate-700">
              {t("support.greeting")}
            </div>
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-retro-purple px-3 py-2 text-xs text-white"
                    : "max-w-[85%] whitespace-pre-wrap rounded-xl rounded-tl-sm border border-retro-border bg-white px-3 py-2 text-xs text-slate-700"
                }
              >
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>

          <div className="border-t border-retro-border bg-retro-bg2 p-2.5 sm:rounded-b-xl">
            <div className="flex items-end gap-2 rounded-lg border border-retro-border bg-white px-2.5 py-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder={t("support.placeholder")}
                className="max-h-24 flex-1 resize-none bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                aria-label={t("support.send")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-retro-pink text-white transition hover:brightness-110 disabled:opacity-30"
              >
                <Send size={13} />
              </button>
            </div>
            <p className="mt-1.5 px-0.5 text-center text-[9px] leading-tight text-slate-400">
              {t("support.disclaimer")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
