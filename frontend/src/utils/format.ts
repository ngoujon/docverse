/** Small display/URL formatting helpers shared across the app. */

/** Human-readable size: 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
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
