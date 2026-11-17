/** Collects a page's <head> values while Next.js renders it to static HTML
 * at build time (pages/_document.tsx provides it): usePageMeta and
 * useJsonLd report into it synchronously, because effects never run
 * during that one-shot server render. Absent in the browser, where those
 * hooks update the live <head> from their effects instead. */

import { createContext, useContext } from "react";

export interface HeadSink {
  title?: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  jsonLd: object[];
}

export const HeadSinkContext = createContext<HeadSink | null>(null);

export function useHeadSink(): HeadSink | null {
  return useContext(HeadSinkContext);
}
