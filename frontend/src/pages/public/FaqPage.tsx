import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ChevronDown,
  Compass,
  LifeBuoy,
  Search,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { useJsonLd, usePageMeta } from "../../hooks/usePageMeta";
import PublicPageLayout from "../../components/layout/PublicPageLayout";

interface FaqItem {
  question: string;
  answer: string;
}

type Category = "start" | "spaces" | "security" | "account";

// Category of each entry of faq.items, by position (same order in every
// locale). A new question appended to the locales needs an entry here.
const ITEM_CATEGORY: Category[] = [
  "start", // what is it
  "start", // account needed
  "spaces", // workspace
  "spaces", // roles
  "spaces", // share links
  "start", // formats
  "start", // web search
  "security", // privacy
  "security", // 2FA
  "security", // deleted by mistake
  "account", // usage limits
];

const CATEGORIES: { key: Category; icon: LucideIcon }[] = [
  { key: "start", icon: Compass },
  { key: "spaces", icon: Users },
  { key: "security", icon: ShieldCheck },
  { key: "account", icon: LifeBuoy },
];

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Wraps every occurrence of the search terms in <mark>, accent-insensitively. */
function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const folded = normalize(text); // same length as `text` for Latin scripts
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let at = folded.indexOf(term);
    while (at >= 0) {
      ranges.push([at, at + term.length]);
      at = folded.indexOf(term, at + term.length);
    }
  }
  if (ranges.length === 0 || folded.length !== text.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start < cursor) return;
    out.push(<Fragment key={`t${i}`}>{text.slice(cursor, start)}</Fragment>);
    out.push(
      <mark key={`m${i}`} className="rounded-sm bg-[#ffe9a8] text-fluent-navy">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  out.push(<Fragment key="end">{text.slice(cursor)}</Fragment>);
  return out;
}

/** FAQ with search, categories and an accordion, also published as
 * FAQPage structured data for search engines. */
export default function FaqPage() {
  const { t } = useTranslation();
  const items = t("faq.items", { returnObjects: true }) as FaqItem[];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));

  // t("faq.title") interpole deja {{brand}} (voir locales/*.json) - le
  // passer a pageTitle() dupliquerait le nom de marque ("... - Docverse").
  usePageMeta({
    title: t("faq.title"),
    description: t("faq.subtitle"),
    canonicalPath: "/faq/",
  });

  useJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  });

  const terms = useMemo(
    () =>
      normalize(query)
        .split(/\s+/)
        .filter((w) => w.length > 1),
    [query],
  );
  const searching = terms.length > 0;

  // Search spans every category; the category filter applies otherwise.
  const visible = items
    .map((item, index) => ({ ...item, index, category: ITEM_CATEGORY[index] ?? "start" }))
    .filter((item) => {
      if (searching) {
        const haystack = normalize(`${item.question} ${item.answer}`);
        return terms.every((term) => haystack.includes(term));
      }
      return category === "all" || item.category === category;
    });

  const counts = CATEGORIES.map(({ key }) => ITEM_CATEGORY.filter((c, i) => c === key && items[i]).length);

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const groups = searching
    ? [{ key: "results", label: t("faq.results", { count: visible.length }), items: visible }]
    : CATEGORIES.filter(({ key }) => category === "all" || category === key)
        .map(({ key }) => ({
          key,
          label: t(`faq.categories.${key}`),
          items: visible.filter((item) => item.category === key),
        }))
        .filter((group) => group.items.length > 0);

  const chip = (active: boolean) =>
    clsx(
      "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition lg:w-full lg:rounded-lg lg:border-transparent lg:px-3 lg:py-2",
      active
        ? "border-fluent-navy bg-fluent-navy text-white lg:bg-white lg:text-fluent-navy lg:shadow-card lg:ring-1 lg:ring-fluent-line"
        : "border-fluent-line bg-white text-fluent-text hover:text-fluent-navy lg:bg-transparent lg:hover:bg-white",
    );

  return (
    <PublicPageLayout
      backLabel={t("faq.backHome")}
      eyebrow={t("faq.eyebrow")}
      title={t("faq.title")}
      subtitle={t("faq.subtitle")}
      width="max-w-5xl"
    >
      <div className="relative mt-8">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fluent-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("faq.searchPlaceholder")}
          aria-label={t("faq.searchPlaceholder")}
          className="w-full rounded-xl border border-fluent-line bg-white py-3.5 pl-11 pr-11 text-[15px] text-fluent-navy shadow-card outline-none transition placeholder:text-slate-400 focus:border-fluent-indigo focus:shadow-focus [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label={t("faq.clear")}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-fluent-muted transition hover:bg-fluent-soft hover:text-fluent-navy"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Categories: a swipeable row on phones, a sticky side menu on desktop */}
        <nav aria-label={t("faq.eyebrow")} className={clsx(searching && "opacity-50")}>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
            <button
              onClick={() => {
                setCategory("all");
                setQuery("");
              }}
              className={chip(!searching && category === "all")}
            >
              {t("faq.categories.all")}
              <span className="ml-auto text-xs font-medium opacity-70">{items.length}</span>
            </button>
            {CATEGORIES.map(({ key, icon: Icon }, i) => (
              <button
                key={key}
                onClick={() => {
                  setCategory(key);
                  setQuery("");
                }}
                className={chip(!searching && category === key)}
              >
                <Icon size={15} className="shrink-0" />
                {t(`faq.categories.${key}`)}
                <span className="ml-auto text-xs font-medium opacity-70">{counts[i]}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-fluent-line bg-white px-6 py-12 text-center">
              <Search size={22} className="mx-auto text-fluent-muted" />
              <p className="mt-3 font-medium text-fluent-navy">{t("faq.noResults", { query: query.trim() })}</p>
              <button
                onClick={() => setQuery("")}
                className="mt-3 text-sm font-semibold text-fluent-indigo hover:text-fluent-navy"
              >
                {t("faq.clear")}
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <h2 className="mb-3 text-sm font-semibold text-fluent-indigo">{group.label}</h2>
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const isOpen = searching || open.has(item.index);
                      return (
                        <div
                          key={item.index}
                          id={`q-${item.index + 1}`}
                          className={clsx(
                            "scroll-mt-6 overflow-hidden rounded-xl border bg-white transition",
                            isOpen ? "border-fluent-line shadow-card" : "border-fluent-line hover:border-slate-300",
                          )}
                        >
                          <button
                            onClick={() => toggle(item.index)}
                            aria-expanded={isOpen}
                            className="flex w-full items-center gap-4 px-5 py-4 text-left"
                          >
                            <span className="flex-1 text-pretty text-[15px] font-semibold leading-snug text-fluent-navy">
                              {highlight(item.question, terms)}
                            </span>
                            <span
                              className={clsx(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition",
                                isOpen
                                  ? "rotate-180 bg-fluent-indigo-soft text-fluent-indigo"
                                  : "bg-fluent-soft text-fluent-muted",
                              )}
                            >
                              <ChevronDown size={16} />
                            </span>
                          </button>
                          {isOpen && (
                            <p className="-mt-1 px-5 pb-5 text-pretty text-[15px] leading-relaxed text-fluent-text animate-fade-in">
                              {highlight(item.answer, terms)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="mt-12 rounded-xl bg-fluent-navy p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                <LifeBuoy size={20} />
              </span>
              <div>
                <p className="text-lg font-semibold text-white">{t("faq.contactTitle")}</p>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-[#adbdcc]">{t("faq.contactText")}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5 sm:pl-[60px]">
              <Link
                to="/#contact"
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-fluent-indigo px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-fluent-navy"
              >
                {t("faq.contactButton")} <ArrowRight size={14} />
              </Link>
              <Link
                to="/demo/"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/50"
              >
                {t("faq.demoButton")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PublicPageLayout>
  );
}
