import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Menu,
  X,
  ArrowRight,
  FolderLock,
  FileStack,
  ScanEye,
  Globe2,
  Gauge,
  ShieldCheck,
  Sparkles,
  Heart,
} from "lucide-react";
import NeoGrid from "../components/landing/NeoGrid";
import ContactForm from "../components/landing/ContactForm";
import Scanlines from "../components/landing/Scanlines";
import Marquee from "../components/landing/Marquee";
import ChatMockup from "../components/landing/ChatMockup";
import OnboardingTerminal from "../components/landing/OnboardingTerminal";
import TerminalWindow from "../components/landing/TerminalWindow";
import NewsletterSignup from "../components/NewsletterSignup";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { usePageMeta } from "../hooks/usePageMeta";
import { useAuth } from "../hooks/useAuth";

const FEATURE_ICONS = [FolderLock, FileStack, ScanEye, Globe2, Gauge, ShieldCheck];
const FEATURE_COLORS = [
  { color: "text-retro-pink", border: "hover:border-retro-pink" },
  { color: "text-retro-cyan", border: "hover:border-retro-cyan" },
  { color: "text-retro-orange", border: "hover:border-retro-orange" },
  { color: "text-retro-yellow", border: "hover:border-retro-yellow" },
  { color: "text-retro-purple", border: "hover:border-retro-purple" },
  { color: "text-retro-cyan", border: "hover:border-retro-cyan" },
];
// First and fourth cards get more room in the bento grid - breaks the
// uniform icon-grid template most generated landing pages default to.
const FEATURE_SPAN = ["sm:col-span-2", "", "", "sm:col-span-2", "", ""];

interface FeatureItem {
  title: string;
  desc: string;
}

export default function LandingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  usePageMeta({
    title: `Open RAG - ${t("hero.title1")} ${t("hero.title2")}`,
    description: t("hero.subtitle"),
    canonicalPath: "/",
  });

  const navLinks = [
    { label: t("nav.features"), href: "#fonctionnalites" },
    { label: t("nav.howItWorks"), href: "#comment-ca-marche" },
    { label: t("nav.contact"), href: "#contact" },
  ];
  const features = t("features.items", { returnObjects: true }) as FeatureItem[];
  const badges = t("hero.badges", { returnObjects: true }) as string[];

  return (
    <div className="min-h-screen bg-retro-bg font-sans text-slate-800">
      <Scanlines />
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-retro-border/60 bg-retro-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2">
            <Sparkles size={20} className="text-retro-pink" />
            <span className="font-mono text-sm font-bold tracking-widest text-slate-900">
              OPEN<span className="text-retro-cyan">::</span>RAG
              <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-blink bg-retro-pink align-middle" />
            </span>
          </a>

          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-mono text-xs uppercase tracking-wider text-slate-600 transition hover:text-retro-cyan"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/demo"
              className="font-mono text-xs uppercase tracking-wider text-slate-600 transition hover:text-retro-cyan"
            >
              {t("nav.demo")}
            </Link>
            <Link
              to="/tarifs"
              className="font-mono text-xs uppercase tracking-wider text-slate-600 transition hover:text-retro-cyan"
            >
              {t("nav.pricing")}
            </Link>
            <Link
              to="/faq"
              className="font-mono text-xs uppercase tracking-wider text-slate-600 transition hover:text-retro-cyan"
            >
              FAQ
            </Link>
            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-retro-pink transition hover:bg-retro-pink hover:text-white hover:shadow-neon"
              >
                {t("nav.launchApp")} <ArrowRight size={13} />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="font-mono text-xs uppercase tracking-wider text-slate-600 transition hover:text-retro-cyan"
                >
                  {t("nav.register")}
                </Link>
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-retro-pink transition hover:bg-retro-pink hover:text-white hover:shadow-neon"
                >
                  {t("auth.login.title")} <ArrowRight size={13} />
                </Link>
              </>
            )}
            <LanguageSwitcher variant="dark" />
          </nav>

          <div className="flex items-center gap-3 md:hidden">
            <LanguageSwitcher variant="dark" />
            <button onClick={() => setMobileMenuOpen((v) => !v)} className="text-slate-700">
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-retro-border/60 bg-retro-bg px-4 py-3 md:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-mono text-xs uppercase tracking-wider text-slate-600"
                >
                  {l.label}
                </a>
              ))}
              <Link
                to="/demo"
                onClick={() => setMobileMenuOpen(false)}
                className="font-mono text-xs uppercase tracking-wider text-slate-600"
              >
                {t("nav.demo")}
              </Link>
              <Link
                to="/tarifs"
                onClick={() => setMobileMenuOpen(false)}
                className="font-mono text-xs uppercase tracking-wider text-slate-600"
              >
                {t("nav.pricing")}
              </Link>
              <Link
                to="/faq"
                onClick={() => setMobileMenuOpen(false)}
                className="font-mono text-xs uppercase tracking-wider text-slate-600"
              >
                FAQ
              </Link>
              {user ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-retro-pink"
                >
                  {t("nav.launchApp")} <ArrowRight size={13} />
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="font-mono text-xs uppercase tracking-wider text-slate-600"
                  >
                    {t("nav.register")}
                  </Link>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-retro-pink"
                  >
                    {t("auth.login.title")} <ArrowRight size={13} />
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero - two columns: pitch + a real product mockup instead of an abstract graphic */}
      <section id="top" className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full opacity-30 blur-[100px]"
          style={{
            background: "radial-gradient(closest-side, #ff2bd6, transparent 70%)",
          }}
        />
        <NeoGrid />

        <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-6">
          <div className="text-center lg:text-left">
            <div className="mb-5 inline-flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-retro-border bg-retro-panel/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-retro-cyan"
                >
                  {b}
                </span>
              ))}
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              <span
                className="bg-gradient-to-r from-retro-pink via-retro-purple to-retro-cyan bg-clip-text text-transparent"
                style={{ textShadow: "0 0 40px rgba(255,43,214,0.25)" }}
              >
                {t("hero.title1")}
              </span>
              <br />
              <span className="text-slate-900">{t("hero.title2")}</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-sm text-slate-600 sm:text-base lg:mx-0">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                to="/register"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-retro-pink bg-retro-pink px-6 py-3 font-mono text-xs uppercase tracking-wider text-white shadow-neon transition hover:bg-retro-pink/90 sm:w-auto"
              >
                {t("hero.ctaTry")} <ArrowRight size={14} />
              </Link>
              <Link
                to="/tarifs"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-retro-border px-6 py-3 font-mono text-xs uppercase tracking-wider text-slate-700 transition hover:border-retro-cyan hover:text-retro-cyan sm:w-auto"
              >
                {t("hero.ctaDiscover")}
              </Link>
            </div>
          </div>

          <Link to="/demo" className="block transition hover:-translate-y-0.5">
            <ChatMockup />
          </Link>
        </div>
      </section>

      <Marquee items={badges} />

      {/* Features - asymmetric bento grid instead of a uniform icon grid */}
      <section id="fonctionnalites" className="border-t border-retro-border/60 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
              {t("features.eyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              {t("features.title")}
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = FEATURE_ICONS[i];
              const style = FEATURE_COLORS[i];
              return (
                <div
                  key={f.title}
                  className={`rounded-2xl border border-retro-border bg-retro-panel/40 p-5 transition-colors ${style.border} ${FEATURE_SPAN[i]}`}
                >
                  <Icon size={22} className={style.color} />
                  <h3 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works - a terminal session instead of numbered cards */}
      <section id="comment-ca-marche" className="border-t border-retro-border/60 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto max-w-xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-cyan">
              {t("steps.eyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              {t("steps.title")}
            </h2>
          </div>

          <div className="mt-10">
            <OnboardingTerminal />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t border-retro-border/60 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
              {t("contact.eyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              {t("contact.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">{t("contact.subtitle")}</p>
          </div>

          <div className="mt-8">
            <TerminalWindow title="mail --compose">
              <div className="p-5 sm:p-8">
                <ContactForm />
              </div>
            </TerminalWindow>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-retro-border/60 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-b border-retro-border/60 pb-8 text-center sm:flex-row sm:text-left">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
              {t("newsletter.sectionEyebrow")}
            </p>
            <h2 className="mt-1 text-base font-bold text-slate-900">{t("newsletter.sectionTitle")}</h2>
          </div>
          <NewsletterSignup />
        </div>

        <div className="mx-auto mt-6 flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
            {t("footer.tagline", { heart: "" })}
            <Heart size={11} className="text-retro-pink" />
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/tarifs"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              {t("footer.pricing")}
            </Link>
            <Link
              to="/faq"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              FAQ
            </Link>
            <Link
              to="/confidentialite"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              {t("footer.privacy")}
            </Link>
            <Link
              to="/cgu"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              {t("footer.terms")}
            </Link>
            <Link
              to="/cgv"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              {t("footer.sale")}
            </Link>
            <Link
              to="/mentions-legales"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              {t("footer.legal")}
            </Link>
            <Link
              to="/app"
              className="font-mono text-[11px] uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
            >
              {t("footer.launchApp")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
