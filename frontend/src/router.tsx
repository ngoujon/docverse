/**
 * Navigation primitives for the app, on top of the Next.js router.
 *
 * The pages were written against react-router (Link, useNavigate,
 * useLocation...). This module keeps that same small API so the pages and
 * components did not have to change shape when the project moved to
 * Next.js: only the import path changed.
 *
 * Navigation state (react-router's `state`, used to remember where to go
 * back after logging in) is stored in the history entry itself, through
 * the options object the Next.js router saves in `history.state` - so,
 * like with react-router, it survives a page reload and is dropped by a
 * plain navigation to the same URL.
 */

import NextLink from "next/link";
import Router, { useRouter } from "next/router";
import { forwardRef, useEffect, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

/** Key under which the navigation state rides along in Next's history
 * entry options. */
const STATE_KEY = "dvState";

function navigateTo(to: string | number, options: NavigateOptions = {}): void {
  if (typeof to === "number") {
    window.history.go(to);
    return;
  }
  const routerOptions = { scroll: true, [STATE_KEY]: options.state ?? null };
  void (options.replace ? Router.replace(to, undefined, routerOptions) : Router.push(to, undefined, routerOptions));
}

/** Programmatic navigation: `navigate("/path", { replace, state })`, or
 * `navigate(-1)` to go back. The returned function is stable. */
export function useNavigate(): typeof navigateTo {
  return navigateTo;
}

export interface AppLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
}

function readHistoryState(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const entry = window.history.state as { options?: Record<string, unknown> } | null;
    return entry?.options?.[STATE_KEY] ?? null;
  } catch {
    return null;
  }
}

function splitPath(asPath: string): Omit<AppLocation, "state"> {
  const hashIndex = asPath.indexOf("#");
  const hash = hashIndex >= 0 ? asPath.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? asPath.slice(0, hashIndex) : asPath;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  return { pathname: pathname || "/", search, hash };
}

/** The current URL, split like `window.location`, plus its navigation state. */
export function useLocation(): AppLocation {
  const router = useRouter();
  return { ...splitPath(router.asPath), state: readHistoryState() };
}

/** Dynamic segments of the current route (e.g. `spaceId` in /app/:spaceId). */
export function useParams(): Record<string, string | undefined> {
  const { query } = useRouter();
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    params[key] = Array.isArray(value) ? value[0] : value;
  }
  return params;
}

/** The current query string, read from the real URL. */
export function useSearchParams(): [URLSearchParams] {
  const { search } = useLocation();
  return [new URLSearchParams(search)];
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

/** In-app link: a plain <a href> that navigates without a page reload. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, onClick, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // Only a plain left click carrying navigation state needs handling here;
    // everything else (new tab, modifier keys...) is left to NextLink/browser.
    if (
      state === undefined ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (rest.target && rest.target !== "_self")
    ) {
      return;
    }
    event.preventDefault();
    navigateTo(to, { replace, state });
  };
  return <NextLink ref={ref} href={to} replace={replace} onClick={handleClick} {...rest} />;
});

/** Redirects as soon as it renders (used for access guards). */
export function Navigate({ to, replace, state }: { to: string } & NavigateOptions) {
  useEffect(() => {
    navigateTo(to, { replace, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
