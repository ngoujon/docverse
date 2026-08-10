import { useEffect } from "react";

/** Injects a <script type="application/ld+json"> tag for the lifetime of
 * the calling page and removes it on unmount - lets an individual route
 * carry its own structured data (e.g. FAQPage) without touching the
 * static SoftwareApplication schema in index.html. */
export function useJsonLd(data: object) {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data)]);
}
