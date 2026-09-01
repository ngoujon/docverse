/** Audience measurement through [credit] (https://example.com).
 *
 * Opt-in only: nothing leaves the browser until the visitor accepts the
 * consent banner, and only public marketing pages are tracked - never the
 * workspace app, whose paths carry space identifiers.
 */

const ENDPOINT = "https://analytics.example.com/api/tracking/collect";
const SITE_KEY = "[site-key]";

const CONSENT_KEY = "hyaides:analytics-consent";
const SESSION_KEY = "hyaides:analytics-session";

/** Routes of the product itself. Their paths leak space/share ids, so they
 * stay out of the audience measurement entirely. */
export const UNTRACKED_PREFIXES = ["/app", "/share", "/dashboard", "/admin", "/account"];

export type ConsentChoice = "granted" | "denied";

export function isTrackablePath(path: string): boolean {
  return !UNTRACKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return null;
  }
}

const listeners = new Set<(choice: ConsentChoice) => void>();

export function setConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* private mode: the choice just won't survive the session */
  }
  listeners.forEach((fn) => fn(choice));
}

/** Subscribes to consent changes so the tracker can start (or stop) as soon
 * as the visitor answers the banner, without a page reload. */
export function onConsentChange(fn: (choice: ConsentChoice) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** The collect endpoint answers CORS preflights only for example.com origins,
 * so the beacon has to stay a "simple" cross-origin request: form encoding,
 * no custom header, and no attempt to read the (opaque) response. */
function encode(payload: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams({
    site_key: SITE_KEY,
    event_type: "page_view",
    session_id: sessionId(),
  });
  Object.entries(payload).forEach(([key, value]) => {
    body.set(`payload[${key}]`, String(value));
  });
  return body;
}

function send(payload: Record<string, unknown>): void {
  if (typeof window === "undefined" || readConsent() !== "granted") return;
  try {
    const body = encode(payload);
    // sendBeacon survives the tab closing, which is exactly when the time
    // spent on the last page is flushed.
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, body)) return;
    void fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      credentials: "omit",
      keepalive: true,
      body,
    }).catch(() => {
      /* an ad blocker or a network hiccup must never break the page */
    });
  } catch {
    /* ignore */
  }
}

/** Query strings and hashes are dropped on purpose: they carry email
 * verification and password reset tokens on some public routes. */
export function trackPageView(path: string): void {
  if (!isTrackablePath(path)) return;
  send({
    path: path || "/",
    referrer: document.referrer || "",
    title: document.title || "",
  });
}

export function trackTimeOnPage(path: string, seconds: number): void {
  if (!isTrackablePath(path) || seconds <= 0) return;
  send({ path: path || "/", time_on_page: Math.round(seconds * 10) / 10 });
}
