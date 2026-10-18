/** Per-route <head> management: title, description, canonical, robots and
 * JSON-LD structured data - both in the browser and during the build-time
 * prerender (scripts/prerender.mjs), where effects never run. */

import { useEffect } from "react";
import { withTrailingSlash } from "../utils/format";

interface PageMeta {
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
}

/** Set by the build-time prerender script (see scripts/prerender.mjs) right
 * before rendering a given route, so usePageMeta can report the page's real
 * title/description synchronously during that one-shot server render -
 * useEffect never runs there. Stays null in the browser bundle, so this is
 * a no-op for every normal client render. */
let ssrMetaSink: PageMeta | null = null;
export function __setSSRMetaSink(sink: PageMeta | null) {
  ssrMetaSink = sink;
}

/** Beyond the document title, keeps <meta name="description"> and
 * <link rel="canonical"> accurate per route for the handful of pages that
 * are actually meant to be indexed (the SPA ships a single static
 * index.html, so without this every route would report the homepage's
 * canonical URL and description to crawlers that execute JS). Restores
 * the previous values on unmount so navigating back to another page
 * doesn't leak this page's meta. */
export function usePageMeta({ title, description, canonicalPath: rawCanonicalPath, noindex }: PageMeta) {
  // Normalized here rather than trusted from each caller, so a page can't
  // declare a canonical URL that nginx would redirect.
  const canonicalPath =
    rawCanonicalPath && !rawCanonicalPath.startsWith("http") ? withTrailingSlash(rawCanonicalPath) : rawCanonicalPath;
  if (ssrMetaSink) {
    ssrMetaSink.title = title;
    ssrMetaSink.description = description;
    ssrMetaSink.canonicalPath = canonicalPath;
    ssrMetaSink.noindex = noindex;
  }

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let robotsTag: HTMLMetaElement | null = null;
    let previousRobots: string | null = null;
    if (noindex) {
      robotsTag = document.querySelector('meta[name="robots"]');
      if (robotsTag) {
        previousRobots = robotsTag.getAttribute("content");
        robotsTag.setAttribute("content", "noindex, nofollow");
      }
    }

    let descriptionTag: HTMLMetaElement | null = null;
    let previousDescription: string | null = null;
    if (description) {
      descriptionTag = document.querySelector('meta[name="description"]');
      if (descriptionTag) {
        previousDescription = descriptionTag.getAttribute("content");
        descriptionTag.setAttribute("content", description);
      }
    }

    let canonicalTag: HTMLLinkElement | null = null;
    let previousCanonical: string | null = null;
    if (canonicalPath) {
      canonicalTag = document.querySelector('link[rel="canonical"]');
      if (canonicalTag) {
        previousCanonical = canonicalTag.getAttribute("href");
        const canonicalUrl = canonicalPath.startsWith("http")
          ? canonicalPath
          : `${window.location.origin}${canonicalPath}`;
        canonicalTag.setAttribute("href", canonicalUrl);
      }
    }

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== null) {
        descriptionTag.setAttribute("content", previousDescription);
      }
      if (canonicalTag && previousCanonical !== null) {
        canonicalTag.setAttribute("href", previousCanonical);
      }
      if (robotsTag && previousRobots !== null) {
        robotsTag.setAttribute("content", previousRobots);
      }
    };
  }, [title, description, canonicalPath, noindex]);
}

// --- Structured data (JSON-LD) ----------------------------------------------

/** Set by the build-time prerender script (see scripts/prerender.mjs)
 * right before rendering a given route, mirroring usePageMeta's
 * __setSSRMetaSink: useEffect never runs during that one-shot static
 * render, so without this a page's JSON-LD (e.g. FaqPage's FAQPage
 * schema) would only ever reach a browser that executes JS - never a
 * crawler reading the prerendered HTML directly. Stays null in the
 * browser bundle, so this is a no-op for every normal client render. */
let ssrJsonLdSink: object[] | null = null;
export function __setSSRJsonLdSink(sink: object[] | null) {
  ssrJsonLdSink = sink;
}

/** Injects a <script type="application/ld+json"> tag for the lifetime of
 * the calling page and removes it on unmount - lets an individual route
 * carry its own structured data (e.g. FAQPage) without touching the
 * static SoftwareApplication schema in index.html. */
export function useJsonLd(data: object) {
  const json = JSON.stringify(data);

  if (ssrJsonLdSink) {
    ssrJsonLdSink.push(data);
  }

  useEffect(() => {
    // scripts/prerender.mjs already bakes this exact tag into <head> for
    // prerendered routes (data-prerendered marks those) - reuse it instead
    // of appending a duplicate right after hydration.
    const alreadyPrerendered = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"][data-prerendered]'),
    ).some((el) => el.textContent === json);
    if (alreadyPrerendered) return;

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = json;
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);
}
