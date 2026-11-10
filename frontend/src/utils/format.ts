/** Small display/URL formatting helpers shared across the app. */

/** Human-readable size: 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Estimated AI cost in US dollars. Single answers cost fractions of a
 * cent, so small amounts keep enough significant digits to mean something
 * ("0.0016 $") instead of collapsing to "0.00 $". */
export function formatUsd(value: number, locale?: string): string {
  if (value > 0 && value < 0.0001) return `< ${formatUsd(0.0001, locale)}`;
  const digits = value === 0 ? 2 : value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Token counts: 1234 -> "1 234" (locale grouping). */
export function formatCount(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Public pages are prerendered to dist/<route>/index.html (see
 * scripts/prerender.mjs), so nginx serves them as directories and
 * 301-redirects /faq to /faq/. The trailing-slash form is therefore the
 * only URL that answers 200: every canonical tag, sitemap entry and
 * internal link has to use it, or crawlers get a canonical pointing at a
 * redirect. */
export function withTrailingSlash(path: string): string {
  const [pathname, rest = ""] = path.split(/(?=[?#])/, 2);
  return pathname.endsWith("/") ? path : `${pathname}/${rest}`;
}
