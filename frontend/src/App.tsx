import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";
import SupportChatWidget from "./components/layout/SupportChatWidget";
import AnalyticsTracker from "./components/layout/AnalyticsTracker";
import CookieConsentBanner from "./components/layout/CookieConsentBanner";
import { analyticsEnabled, isTrackablePath } from "./utils/analytics";
import { useHeadSink } from "./headSink";
import { loadLanguage } from "./i18n";
import { useLocation } from "./router";

// The support widget helps visitors use the site/app - shown on the public
// marketing pages, not inside the real product (workspace app) where it
// would just be visual noise on top of the actual tool.
const SUPPORT_WIDGET_EXCLUDED_PREFIXES = ["/app", "/share"];

interface Props {
  children: ReactNode;
  /** Account and signed-in pages: they need the browser (session, tokens
   * in the URL), so their static HTML is an empty, noindex shell and they
   * only render once the visitor's language is loaded - never a flash of
   * French for a visitor reading another language. */
  clientOnly?: boolean;
}

/** Shell around every page (pages/_app.tsx): the global widgets (support
 * chat, audience measurement and its consent banner), the <html lang>, and
 * the visitor's language. */
export default function App({ children, clientOnly = false }: Props) {
  const { i18n } = useTranslation();
  const location = useLocation();
  const router = useRouter();
  const [languageReady, setLanguageReady] = useState(false);

  const headSink = useHeadSink();
  if (headSink && clientOnly) headSink.noindex = true;

  useEffect(() => {
    document.documentElement.lang = i18n.language?.slice(0, 2) || "fr";
  }, [i18n.language]);

  // The static HTML and the hydration render are French. A visitor whose
  // language is another one gets that one small file, then the page
  // re-renders in their language.
  useEffect(() => {
    const lng = i18n.language;
    void loadLanguage(lng)
      .then(async () => {
        const code = (lng || "fr").slice(0, 2);
        if (code !== "fr" && i18n.hasResourceBundle(code, "translation")) await i18n.changeLanguage(lng);
      })
      .finally(() => setLanguageReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (clientOnly && !(languageReady && router.isReady)) return null;

  const showSupportWidget = !SUPPORT_WIDGET_EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p));
  // Only the pages the audience measurement actually covers ask for consent.
  const showConsentBanner = analyticsEnabled && isTrackablePath(location.pathname);

  return (
    <>
      {children}
      {showSupportWidget && <SupportChatWidget />}
      <AnalyticsTracker />
      {showConsentBanner && <CookieConsentBanner />}
    </>
  );
}
