import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, X } from "lucide-react";
import { streamSupportChat } from "../../api/client";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import AnimatedText from "../ui/AnimatedText";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Floating help-desk chat of the public pages (backend routers/support.py). */
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
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ];
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
          className="fixed bottom-4 right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14 bg-fluent-indigo text-white shadow-neon transition hover:scale-105 hover:bg-fluent-navy sm:bottom-6 sm:right-6"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("support.title")}
          className="fixed inset-0 z-[60] flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-xl sm:border sm:border-fluent-line sm:shadow-card-lg"
        >
          <div className="flex items-center gap-2.5 border-b border-fluent-line bg-white px-4 py-3 sm:rounded-t-xl">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo">
              <MessageCircle size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fluent-navy">{t("support.title")}</p>
              <p className="truncate text-xs text-fluent-muted">{t("support.subtitle")}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("support.closeLabel")}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-black/5 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-fluent-soft px-4 py-4">
            <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-fluent-line bg-white px-3 py-2 text-sm text-fluent-navy shadow-card">
              {t("support.greeting")}
            </div>
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-fluent-indigo px-3 py-2 text-sm text-white"
                    : "max-w-[85%] whitespace-pre-wrap rounded-xl rounded-tl-sm border border-fluent-line bg-white px-3 py-2 text-sm text-fluent-navy shadow-card"
                }
              >
                {m.content ? (
                  <AnimatedText
                    text={m.content}
                    animate={m.role === "assistant" && streaming && i === messages.length - 1}
                  />
                ) : streaming && i === messages.length - 1 ? (
                  "…"
                ) : (
                  ""
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-fluent-line bg-white p-3 sm:rounded-b-xl">
            <div className="flex items-center gap-2 rounded-lg border border-fluent-line bg-white px-2.5 py-2 shadow-card focus-within:border-fluent-indigo focus-within:shadow-focus">
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
                className="block max-h-24 flex-1 resize-none bg-transparent text-sm leading-5 text-fluent-navy placeholder:text-slate-400 outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                aria-label={t("support.send")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fluent-indigo text-white transition hover:bg-fluent-navy disabled:opacity-30"
              >
                <Send size={13} />
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-line px-0.5 text-center text-[9px] leading-tight text-slate-400">
              {t("support.disclaimer")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
