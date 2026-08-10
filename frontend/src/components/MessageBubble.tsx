import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Globe, User, Bot } from "lucide-react";
import clsx from "clsx";
import type { Message } from "../types";
import AnimatedText from "./AnimatedText";

function withCitationLinks(content: string): string {
  return content.replace(/\[(\d+)\]/g, (_m, n) => `[${n}](#cite-${n})`);
}

export default function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === "user";

  // The model retrieves candidate sources but doesn't always cite every
  // one of them - only show badges for numbers ([1], [2], ...) that
  // actually appear in the answer, using each source's original 1-based
  // position so the badge number still matches the inline citation.
  const citedNumbers = new Set(
    Array.from(message.content.matchAll(/\[(\d+)\]/g), (m) => Number(m[1]))
  );
  const visibleSources = (message.sources ?? [])
    .map((source, i) => ({ source, number: i + 1 }))
    .filter(({ number }) => citedNumbers.has(number));

  return (
    <div className={clsx("flex gap-3 px-2 animate-fade-in", isUser && "flex-row-reverse")}>
      <div
        className={clsx(
          "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-accent/20 text-accent" : "bg-surface-3 text-slate-500 dark:text-slate-400"
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div className={clsx("max-w-[75%] space-y-2", isUser && "flex flex-col items-end")}>
        <div
          className={clsx(
            "markdown-body rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed",
            isUser
              ? "bg-accent text-white rounded-tr-sm"
              : "bg-surface-2 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-surface-border"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : !message.content ? (
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-slate-500 dark:bg-slate-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-slate-500 dark:bg-slate-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-slate-500 dark:bg-slate-400" />
            </span>
          ) : isStreaming ? (
            <p className="whitespace-pre-wrap">
              <AnimatedText text={message.content} />
            </p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith("#cite-")) {
                    return <sup className="cite-badge">{children}</sup>;
                  }
                  return (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {withCitationLinks(message.content)}
            </ReactMarkdown>
          )}
        </div>

        {visibleSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleSources.map(({ source: s, number }) => (
              <a
                key={number}
                href={s.type === "web" ? s.url : undefined}
                target={s.type === "web" ? "_blank" : undefined}
                rel="noreferrer"
                title={s.label}
                className={clsx(
                  "flex max-w-[220px] items-center gap-1 rounded-full border border-surface-border bg-surface-1 px-2 py-1 text-[11px] text-slate-500 dark:text-slate-400",
                  s.type === "web" && "hover:border-accent hover:text-accent"
                )}
              >
                <span className="cite-badge shrink-0">{number}</span>
                {s.type === "web" ? (
                  <Globe size={11} className="shrink-0" />
                ) : (
                  <FileText size={11} className="shrink-0" />
                )}
                <span className="truncate">{s.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
