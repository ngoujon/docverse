import { createElement, Fragment } from "react";
import { useHydrated } from "../../hooks/useHydrated";

/** Text built from several pieces (e.g. `{a} · {b}`), rendered exactly as
 * the site always has: one text run in the static HTML, separate text
 * nodes once the page runs in the browser.
 *
 * React's static render separates adjacent text pieces with <!-- -->
 * markers, which splits the text into several runs and can shift a glyph
 * by a subpixel compared to a single run. Joining the pieces until
 * hydration is done keeps the static HTML pixel-identical, and the
 * browser render matches what the app has always produced. */
export default function JoinedText({ parts }: { parts: (string | number)[] }) {
  const hydrated = useHydrated();
  if (!hydrated) return <>{parts.join("")}</>;
  return createElement(Fragment, null, ...parts);
}
