import { useEffect } from "react";

interface PageMeta {
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
}

/** Beyond the document title, keeps <meta name="description"> and
 * <link rel="canonical"> accurate per route for the handful of pages that
 * are actually meant to be indexed (the SPA ships a single static
 * index.html, so without this every route would report the homepage's
 * canonical URL and description to crawlers that execute JS). Restores
 * the previous values on unmount so navigating back to another page
 * doesn't leak this page's meta. */
export function usePageMeta({ title, description, canonicalPath, noindex }: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let robotsTag: HTMLMetaElement | null = null;
    let previousRobots: string | null = null;
    if (noindex) {
      robotsTag = document.querySelector('meta[name="robots"]');
      if (robotsTag) {
        previousRobots = robotsTag.getAttribute("content");
        robotsTag.setAttribute("content", "noindex, nofollow");
      }
    }

    let descriptionTag: HTMLMetaElement | null = null;
    let previousDescription: string | null = null;
    if (description) {
      descriptionTag = document.querySelector('meta[name="description"]');
      if (descriptionTag) {
        previousDescription = descriptionTag.getAttribute("content");
        descriptionTag.setAttribute("content", description);
      }
    }

    let canonicalTag: HTMLLinkElement | null = null;
    let previousCanonical: string | null = null;
    if (canonicalPath) {
      canonicalTag = document.querySelector('link[rel="canonical"]');
      if (canonicalTag) {
        previousCanonical = canonicalTag.getAttribute("href");
        const canonicalUrl = canonicalPath.startsWith('http')
          ? canonicalPath
          : `${window.location.origin}${canonicalPath}`;
        canonicalTag.setAttribute("href", canonicalUrl);
      }
    }

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== null) {
        descriptionTag.setAttribute("content", previousDescription);
      }
      if (canonicalTag && previousCanonical !== null) {
        canonicalTag.setAttribute("href", previousCanonical);
      }
      if (robotsTag && previousRobots !== null) {
        robotsTag.setAttribute("content", previousRobots);
      }
    };
  }, [title, description, canonicalPath, noindex]);
}
