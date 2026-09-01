import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  onConsentChange,
  readConsent,
  trackPageView,
  trackTimeOnPage,
  type ConsentChoice,
} from "../utils/analytics";

/** Sends one [credit] page view per route change, plus the time spent on the
 * page when the visitor leaves it. Renders nothing. */
export default function AnalyticsTracker() {
  const { pathname } = useLocation();
  // Read on mount rather than at first render: the prerender (entry-server)
  // has no localStorage, and this keeps the server markup consent-free.
  const [consent, setConsent] = useState<ConsentChoice | null>(null);

  useEffect(() => {
    setConsent(readConsent());
    return onConsentChange(setConsent);
  }, []);

  const flushed = useRef(false);

  useEffect(() => {
    if (consent !== "granted") return;

    const start = Date.now();
    flushed.current = false;
    trackPageView(pathname);

    // Once per page: hiding the tab and coming back must not count twice.
    const flush = () => {
      if (flushed.current) return;
      flushed.current = true;
      trackTimeOnPage(pathname, (Date.now() - start) / 1000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    // Safari fires pagehide rather than hiding the document on a close.
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [pathname, consent]);

  return null;
}
