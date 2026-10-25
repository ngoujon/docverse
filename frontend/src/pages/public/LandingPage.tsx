import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Menu,
  X,
  ArrowRight,
  Check,
  FolderLock,
  FileStack,
  UserCog,
  Infinity as InfinityIcon,
  Globe2,
  ServerCog,
  MapPin,
  Cpu,
  ShieldCheck,
  MicOff,
} from "lucide-react";
import { GradientStripe } from "../../components/landing/Decor";
import { ChatMockup, OnboardingTerminal } from "../../components/landing/Terminal";
import ContactForm from "../../components/landing/ContactForm";
import HighlightBanner from "../../components/landing/HighlightBanner";
import Testimonials from "../../components/landing/Testimonials";
import NewsletterSignup from "../../components/landing/NewsletterSignup";
import LanguageSwitcher from "../../components/ui/LanguageSwitcher";
import BrandLogo from "../../components/ui/BrandLogo";
import { usePageMeta } from "../../hooks/usePageMeta";
import { useAuth } from "../../hooks/useAuth";
import { BRAND } from "../../brand";

const SOVEREIGNTY_ICONS = [MapPin, Cpu, ShieldCheck, MicOff];

const FEATURE_ICONS = [FolderLock, FileStack, UserCog, InfinityIcon, Globe2, ServerCog];
// The two strongest business arguments (silo governance, fixed cost) get
// more room in the bento grid, rather than a uniform icon-grid template.
// The last tile widens on 3 columns so the grid closes without a hole.
const FEATURE_SPAN = ["sm:col-span-2", "", "", "sm:col-span-2", "", "lg:col-span-2"];

// Indexed formats, shown as a discreet "client logos" style row.
const FORMATS = ["PDF", "DOCX", "Markdown", "CSV", "HTML", "PNG · JPG", "MP3 · WAV"];

interface FeatureItem {
  title: string;
  desc: string;
}

/** In-page anchor ("#...") or app route, rendered as <a> or <Link>. */
interface NavItem {
  label: string;
  to: string;
}

function NavLink({ item, className, onClick }: { item: NavItem; className: string; onClick?: () => void }) {
  return item.to.startsWith("#") ? (
    <a href={item.to} onClick={onClick} className={className}>
      {item.label}
    </a>
  ) : (
    <Link to={item.to} onClick={onClick} className={className}>
      {item.label}
    </Link>
  );
}

const navTextLink = "text-[15px] font-medium text-fluent-navy transition hover:text-fluent-indigo";
const footerLink = "text-sm text-fluent-text transition hover:text-fluent-navy";
const eyebrow = "text-sm font-semibold text-fluent-indigo";
const sectionTitle =
  "mt-3 max-w-3xl text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-fluent-navy sm:text-4xl lg:max-w-none";
// Leads run the full container width on desktop so short ones stay on a
// single line under their (single-line) title.
const sectionLead =
  "mt-4 max-w-2xl text-pretty text-base leading-relaxed text-fluent-text sm:text-[17px] lg:max-w-none";
const card = "rounded-xl border border-fluent-line bg-white p-6 shadow-card";
const cardTitle = "mt-4 text-balance font-semibold leading-snug text-fluent-navy";
const cardText = "mt-2 text-pretty text-sm leading-relaxed text-fluent-text";
const iconChip = "flex h-9 w-9 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-fluent-indigo px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-fluent-navy";

/** Marketing homepage (prerendered at build time for crawlers). */
export default function LandingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  usePageMeta({
    title: `${BRAND.name} - ${t("hero.title1")} ${t("hero.title2")}`,
    description: t("hero.subtitle"),
    canonicalPath: "/",
  });

  const navLinks: NavItem[] = [
    { label: t("nav.sovereignty"), to: "#souverainete" },
    { label: t("nav.features"), to: "#fonctionnalites" },
    { label: t("nav.demo"), to: "/demo/" },
    { label: t("nav.contact"), to: "#contact" },
    { label: "FAQ", to: "/faq/" },
    ...(user ? [] : [{ label: t("nav.register"), to: "/register" }]),
  ];
  // Highlighted call to action closing the nav: the app once signed in.
  const navCta = user
    ? { label: t("nav.launchApp"), to: "/dashboard" }
    : { label: t("auth.login.title"), to: "/login" };
  const footerLinks: NavItem[] = [
    { label: "FAQ", to: "/faq/" },
    { label: t("footer.privacy"), to: "/confidentialite/" },
    { label: t("footer.terms"), to: "/cgu/" },
    { label: t("footer.legal"), to: "/mentions-legales/" },
    { label: t("footer.launchApp"), to: "/app" },
  ];
  const closeMenu = () => setMobileMenuOpen(false);
  const features = t("features.items", { returnObjects: true }) as FeatureItem[];
  const badges = t("hero.badges", { returnObjects: true }) as string[];
  const sovereigntyItems = t("sovereignty.items", {
    returnObjects: true,
  }) as FeatureItem[];

  return (
    <div className="min-h-screen overflow-x-clip bg-white font-sans text-fluent-navy">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-fluent-line/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="#top" aria-label={BRAND.name}>
            <BrandLogo className="text-fluent-navy" />
          </a>

          <nav className="hidden items-center gap-7 lg:flex">
            {navLinks.map((l) => (
              <NavLink key={l.to} item={l} className={navTextLink} />
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <LanguageSwitcher variant="dark" />
            <Link to={navCta.to} className={`${btnPrimary} !px-4 !py-2 !text-sm`}>
              {navCta.label} <ArrowRight size={14} />
            </Link>
          </div>

          <div className="flex items-center gap-3 lg:hidden">
            <LanguageSwitcher variant="dark" />
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="text-fluent-navy"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-fluent-line bg-white px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-4">
              {navLinks.map((l) => (
                <NavLink key={l.to} item={l} onClick={closeMenu} className={navTextLink} />
              ))}
              <Link to={navCta.to} onClick={closeMenu} className={btnPrimary}>
                {navCta.label} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero - pitch + a real product mockup instead of an abstract graphic */}
      <section id="top" className="relative px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <GradientStripe />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-fluent-indigo-soft py-1 pl-1 pr-3 text-sm font-medium text-fluent-navy">
              <span className="shrink-0 rounded-full bg-fluent-indigo px-2 py-0.5 text-[11px] font-semibold text-white">
                {badges[0]}
              </span>
              <span className="truncate">{badges[1]}</span>
            </span>

            {/* Two fixed lines: the promise, then the proof in indigo -
                balanced so no line ends on a lone word. */}
            <h1 className="mt-6 text-[2.1rem] font-semibold leading-[1.1] min-[400px]:text-[2.35rem] tracking-[-0.035em] text-fluent-navy sm:text-5xl lg:text-[3.25rem]">
              <span className="block text-balance">{t("hero.title1")}</span>
              <span className="block text-balance text-fluent-indigo">{t("hero.title2")}</span>
            </h1>

            <p className="mt-6 max-w-[34rem] text-pretty text-base leading-[1.7] text-fluent-text sm:text-[17px]">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/app" className={btnPrimary}>
                {t("hero.ctaTry")} <ArrowRight size={15} />
              </Link>
              <Link
                to="/demo/"
                className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-fluent-indigo transition hover:text-fluent-navy"
              >
                {t("hero.ctaDiscover")} <ArrowRight size={15} />
              </Link>
            </div>

            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
              {badges.slice(2).map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-fluent-text">
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-fluent-indigo-soft text-fluent-indigo">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <Link to="/demo/" className="block transition hover:-translate-y-0.5">
              <ChatMockup />
            </Link>
            <div className="absolute -bottom-14 left-8 hidden animate-float items-center gap-3 rounded-xl border border-fluent-line bg-white py-3 pl-3 pr-5 shadow-panel md:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-fluent-green-soft text-fluent-green">
                <ShieldCheck size={18} />
              </span>
              <div>
                <p className="text-xs text-fluent-muted">{t("sovereignty.eyebrow")}</p>
                <p className="text-sm font-semibold text-fluent-navy">
                  {BRAND.hostingProvider} · {BRAND.aiProvider}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Formats - discreet single row, in the spirit of a client-logo strip */}
      <section className="relative px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-balance text-center text-sm text-fluent-muted">{t("formats.title")}</p>
          <div className="mx-auto mt-6 flex max-w-xs flex-wrap items-center justify-center gap-x-7 gap-y-3 sm:max-w-none sm:gap-x-10 sm:gap-y-4">
            {FORMATS.map((f, i) => (
              <span
                key={f}
                className="whitespace-nowrap text-base font-bold text-slate-400 sm:text-lg"
                style={{ letterSpacing: i % 2 ? "0.06em" : "-0.02em", fontStyle: i % 3 === 1 ? "italic" : "normal" }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Souverainete - place juste apres le hero parce que c'est
          l'argument d'achat principal, pas un detail de bas de page. */}
      <section id="souverainete" className="bg-fluent-soft px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className={eyebrow}>{t("sovereignty.eyebrow")}</p>
          <h2 className={sectionTitle}>{t("sovereignty.title")}</h2>
          <p className={sectionLead}>{t("sovereignty.subtitle")}</p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {sovereigntyItems.map((item, i) => {
              const Icon = SOVEREIGNTY_ICONS[i];
              return (
                <div key={item.title} className={card}>
                  <span className={iconChip}>
                    <Icon size={18} />
                  </span>
                  <h3 className={cardTitle}>{item.title}</h3>
                  <p className={cardText}>{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <HighlightBanner />

      {/* Solution - features and onboarding merged into one section instead
          of two separate scroll stops with their own nav entries */}
      <section id="fonctionnalites" className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className={eyebrow}>{t("features.eyebrow")}</p>
          <h2 className={sectionTitle}>{t("features.title")}</h2>
          <p className={sectionLead}>{t("features.subtitle")}</p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <div
                  key={f.title}
                  className={`${card} transition hover:-translate-y-0.5 hover:shadow-panel ${FEATURE_SPAN[i]}`}
                >
                  <span className={iconChip}>
                    <Icon size={18} />
                  </span>
                  <h3 className={cardTitle}>{f.title}</h3>
                  <p className={cardText}>{f.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-16 border-t border-fluent-line pt-14 sm:mt-24 sm:pt-16">
            <p className={eyebrow}>{t("steps.eyebrow")}</p>
            <h3 className="mt-3 max-w-2xl text-balance text-2xl font-semibold leading-tight tracking-[-0.02em] text-fluent-navy sm:text-3xl lg:max-w-none">
              {t("steps.title")}
            </h3>
            <div className="mt-10">
              <OnboardingTerminal />
            </div>
          </div>
        </div>
      </section>

      <Testimonials />

      {/* Contact */}
      <section id="contact" className="bg-fluent-soft px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[1fr_1.45fr] lg:gap-16">
          <div className="lg:pt-6">
            <p className={eyebrow}>{t("contact.eyebrow")}</p>
            <h2 className={sectionTitle}>{t("contact.title")}</h2>
            <p className={sectionLead}>{t("contact.subtitle")}</p>
          </div>

          <div className="rounded-xl border border-fluent-line bg-white p-6 shadow-card-lg sm:p-8">
            <ContactForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-fluent-line px-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 border-b border-fluent-line py-12 sm:flex-row sm:items-center">
          <div>
            <p className={eyebrow}>{t("newsletter.sectionEyebrow")}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-fluent-navy">
              {t("newsletter.sectionTitle")}
            </h2>
          </div>
          <NewsletterSignup />
        </div>

        {/* Extra bottom room on mobile so the floating help button never
            covers the last links. */}
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 pb-24 pt-8 sm:flex-row sm:items-center sm:pb-8">
          <div className="flex flex-col gap-2">
            <BrandLogo className="text-fluent-navy" />
            {BRAND.creditName && (
              <p className="text-sm text-fluent-muted">
                {t("footer.tagline")}{" "}
                {BRAND.creditUrl ? (
                  <a
                    href={BRAND.creditUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-fluent-indigo hover:text-fluent-navy"
                  >
                    {BRAND.creditName}
                  </a>
                ) : (
                  BRAND.creditName
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {footerLinks.map((l) => (
              <Link key={l.to} to={l.to} className={footerLink}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
