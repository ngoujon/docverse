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
    expect(isTrackablePath("/faq")).toBe(true);
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
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
  }

  it("sends nothing without consent", () => {
    const fetchMock = stubFetch();
    trackPageView("/faq");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing on an untracked path even with consent", () => {
    const fetchMock = stubFetch();
    setConsent("granted");
    trackPageView("/app/42");
    trackTimeOnPage("/app/42", 12);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a time on page under a second as noise", () => {
    const fetchMock = stubFetch();
    setConsent("granted");
    trackTimeOnPage("/faq", 0.4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts form-encoded events with a reusable session id once consent is granted", () => {
    const fetchMock = stubFetch();
    setConsent("granted");
    trackPageView("/faq");
    trackTimeOnPage("/faq", 3.14);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://analytics.example.test/collect");
    // A "simple" cross-origin request: safelisted content type, so no
    // preflight - the collect endpoint does not answer preflights from this origin.
    expect(init?.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    });
    expect(init?.mode).toBe("no-cors");
    expect(init?.keepalive).toBe(true);

    const first = new URLSearchParams(String(init?.body));
    const second = new URLSearchParams(String(fetchMock.mock.calls[1][1]?.body));
    expect(first.get("payload[path]")).toBe("/faq");
    expect(second.get("payload[time_on_page]")).toBe("3.1");
    expect(first.get("session_id")).toBe(second.get("session_id"));
    expect(first.get("site_key")).toMatch(/^tk_/);
    expect(first.get("event_type")).toBe("page_view");
  });
});
