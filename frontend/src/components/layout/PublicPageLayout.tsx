import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LegalFooterLinks from "./LegalFooterLinks";

/** Shell of the standalone marketing/legal pages (FAQ, demo, terms,
 * privacy, legal notice): back link, eyebrow, title, subtitle, content
 * and the legal links footer, on the retro palette. */
export default function PublicPageLayout({
  backLabel,
  eyebrow,
  title,
  subtitle,
  width = "max-w-2xl",
  subtitleClassName = "mt-3 text-sm text-slate-600",
  children,
}: {
  backLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  width?: string;
  subtitleClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className={`mx-auto ${width}`}>
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {backLabel}
        </Link>

        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        <p className={subtitleClassName}>{subtitle}</p>

        {children}
        <LegalFooterLinks className="mt-10" />
      </div>
    </div>
  );
}

/** Titled text block of a legal page. */
export function LegalSection({ title, body, preLine }: { title: string; body: string; preLine?: boolean }) {
  return (
    <div className="rounded-2xl border border-retro-border bg-retro-panel/40 p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className={`mt-2 ${preLine ? "whitespace-pre-line " : ""}text-xs leading-relaxed text-slate-600`}>{body}</p>
    </div>
  );
}
