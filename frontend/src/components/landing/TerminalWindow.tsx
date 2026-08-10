import type { ReactNode } from "react";

export default function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-retro-border bg-retro-panel shadow-[0_20px_60px_-15px_rgba(139,47,214,0.35)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-retro-border bg-retro-bg2 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-retro-pink/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-retro-yellow/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-retro-cyan/70" />
        <span className="ml-2 truncate font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
