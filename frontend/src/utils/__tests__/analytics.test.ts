import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTrackablePath,
  onConsentChange,
  readConsent,
  setConsent,
  trackPageView,
  trackTimeOnPage,
} from "../analytics";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isTrackablePath", () => {
  it("accepts the public marketing pages", () => {
    expect(isTrackablePath("/")).toBe(true);
    expect(isTrackablePath("/tarifs")).toBe(true);
    expect(isTrackablePath("/confidentialite")).toBe(true);
  });

  it("rejects the workspace and account pages", () => {
    expect(isTrackablePath("/app")).toBe(false);
    expect(isTrackablePath("/app/42")).toBe(false);
    expect(isTrackablePath("/share/abc")).toBe(false);
    expect(isTrackablePath("/dashboard")).toBe(false);
    expect(isTrackablePath("/admin")).toBe(false);
    expect(isTrackablePath("/account")).toBe(false);
  });

  it("does not reject a public path that merely starts with the same letters", () => {
    expect(isTrackablePath("/applications")).toBe(true);
  });
});

describe("consent", () => {
  it("starts unanswered and remembers the answer", () => {
    expect(readConsent()).toBeNull();
    setConsent("denied");
    expect(readConsent()).toBe("denied");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const seen: string[] = [];
    const unsubscribe = onConsentChange((c) => seen.push(c));
    setConsent("granted");
    unsubscribe();
    setConsent("denied");
    expect(seen).toEqual(["granted"]);
  });
});

describe("beacons", () => {
  function stubFetch() {
    // jsdom has no sendBeacon; stub it away so the fallback path is explicit.
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: undefined });
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
  }

  it("sends nothing without consent", () => {
    const fetchMock = stubFetch();
    trackPageView("/tarifs");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing on an untracked path even with consent", () => {
    const fetchMock = stubFetch();
    setConsent("granted");
    trackPageView("/app/42");
    trackTimeOnPage("/app/42", 12);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts form-encoded events with a reusable session id once consent is granted", () => {
    const fetchMock = stubFetch();
    setConsent("granted");
    trackPageView("/tarifs");
    trackTimeOnPage("/tarifs", 3.14);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://analytics.example.com/api/tracking/collect");
    // A "simple" cross-origin request: no custom header, so no preflight -
    // the collect endpoint only answers preflights for example.com origins.
    expect(init?.headers).toBeUndefined();
    expect(init?.mode).toBe("no-cors");

    const first = new URLSearchParams(String(init?.body));
    const second = new URLSearchParams(String(fetchMock.mock.calls[1][1]?.body));
    expect(first.get("payload[path]")).toBe("/tarifs");
    expect(second.get("payload[time_on_page]")).toBe("3.1");
    expect(first.get("session_id")).toBe(second.get("session_id"));
    expect(first.get("site_key")).toMatch(/^tk_/);
    expect(first.get("event_type")).toBe("page_view");
  });

  it("prefers sendBeacon when the browser provides it", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    setConsent("granted");
    trackPageView("/faq");

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(new URLSearchParams(String(beacon.mock.calls[0][1])).get("payload[path]")).toBe("/faq");
  });
});
