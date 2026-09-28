import { useEffect } from "react";

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
      document.head.querySelectorAll('script[type="application/ld+json"][data-prerendered]')
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
