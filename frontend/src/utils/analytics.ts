/** Opt-in audience measurement, sent to the collector configured at build
 * time (VITE_ANALYTICS_ENDPOINT + VITE_ANALYTICS_SITE_KEY). Without both,
 * measurement is disabled entirely and no consent banner is shown.
 *
 * Opt-in only: nothing leaves the browser until the visitor accepts the
 * consent banner, and only public marketing pages are tracked - never the
 * workspace app, whose paths carry space identifiers.
 */

const ENDPOINT: string = import.meta.env.VITE_ANALYTICS_ENDPOINT || "";
const SITE_KEY: string = import.meta.env.VITE_ANALYTICS_SITE_KEY || "";

export const analyticsEnabled = Boolean(ENDPOINT && SITE_KEY);

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

/** The collect endpoint doesn't answer CORS preflights from this origin,
 * so the beacon has to stay a "simple" cross-origin request: form encoding
 * (a safelisted content type, hence no preflight) and no custom header. */
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

/** `no-cors` because the API answers `Cross-Origin-Resource-Policy:
 * same-origin`: its response is unreadable from here, and asking for it would
 * only log a network error next to a hit that was in fact recorded.
 * `keepalive` replaces sendBeacon, whose requests never reach this collector. */
function send(payload: Record<string, unknown>): void {
  if (!analyticsEnabled || typeof window === "undefined" || readConsent() !== "granted") return;
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: encode(payload).toString(),
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

/** Under a second, the event is noise (a tab flicked to and back). */
const MIN_TIME_ON_PAGE_SECONDS = 1;

export function trackTimeOnPage(path: string, seconds: number): void {
  if (!isTrackablePath(path) || seconds < MIN_TIME_ON_PAGE_SECONDS) return;
  send({ path: path || "/", time_on_page: Math.round(seconds * 10) / 10 });
}
