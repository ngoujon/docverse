/** SEO Monitor, the self-hosted audience tracker loaded by index.html.
 * Exempt from consent (CNIL audience measurement guidelines), so unlike
 * utils/analytics.ts it isn't gated on the banner. The global is absent on
 * localhost, during the prerender, and when an ad blocker drops the
 * script: every call here is a silent no-op then. */

interface SeoMonitor {
  track: (name: string, props?: Record<string, string>) => void;
  optOut: () => void;
}

declare global {
  interface Window {
    seoMonitor?: SeoMonitor;
  }
}

/** Never pass personal data here (email, name, phone, customer id). */
export function trackConversion(name: string, props?: Record<string, string>): void {
  try {
    window.seoMonitor?.track(name, props);
  } catch {
    /* measurement must never break the page */
  }
}

/** Returns whether the opt-out could be recorded (false if the tracker
 * isn't loaded on this page). */
export function optOutOfAudience(): boolean {
  if (typeof window === "undefined" || !window.seoMonitor) return false;
  try {
    window.seoMonitor.optOut();
    return true;
  } catch {
    return false;
  }
}
