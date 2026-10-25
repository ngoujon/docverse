import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LegalFooterLinks from "./LegalFooterLinks";
import BrandLogo from "../ui/BrandLogo";
import { BRAND } from "../../brand";

/** Shell of the standalone marketing/legal pages (FAQ, demo, terms,
 * privacy, legal notice): top bar, eyebrow, title, subtitle, content
 * and the legal links footer, on the Fluent Corp palette. */
export default function PublicPageLayout({
  backLabel,
  eyebrow,
  title,
  subtitle,
  width = "max-w-2xl",
  subtitleClassName = "mt-4 leading-relaxed text-fluent-text",
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
    <div className="min-h-screen bg-white font-sans text-fluent-navy">
      <header className="border-b border-fluent-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label={BRAND.name}>
            <BrandLogo className="text-fluent-navy" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-fluent-indigo transition hover:text-fluent-navy"
          >
            <ArrowLeft size={14} /> {backLabel}
          </Link>
        </div>
      </header>

      <div className={`mx-auto px-4 py-16 sm:px-6 ${width}`}>
        <p className="text-sm font-semibold text-fluent-indigo">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fluent-navy sm:text-4xl">{title}</h1>
        <p className={subtitleClassName}>{subtitle}</p>

        {children}
      </div>
      <div className="border-t border-fluent-line bg-fluent-soft pb-24 pt-8 sm:pb-8">
        <LegalFooterLinks />
      </div>
    </div>
  );
}

/** Titled text block of a legal page. */
export function LegalSection({ title, body, preLine }: { title: string; body: string; preLine?: boolean }) {
  return (
    <div className="rounded-xl border border-fluent-line bg-white p-6 shadow-card">
      <h2 className="font-semibold text-fluent-navy">{title}</h2>
      <p className={`mt-2 ${preLine ? "whitespace-pre-line " : ""}text-sm leading-relaxed text-fluent-text`}>{body}</p>
    </div>
  );
}
