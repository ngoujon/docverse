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
