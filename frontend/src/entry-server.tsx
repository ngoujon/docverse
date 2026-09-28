import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { __setSSRMetaSink } from "./hooks/usePageMeta";
import { __setSSRJsonLdSink } from "./hooks/useJsonLd";
import i18n from "./i18n";

interface RenderedPage {
  appHtml: string;
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  jsonLd: object[];
}

/** Renders a single route to static markup for the build-time prerender
 * script (scripts/prerender.mjs). Used only in Node, never shipped to the
 * browser. */
export function render(url: string): RenderedPage {
  i18n.changeLanguage("fr");

  const meta: Omit<RenderedPage, "jsonLd"> = { appHtml: "", title: "" };
  const jsonLd: object[] = [];
  __setSSRMetaSink(meta);
  __setSSRJsonLdSink(jsonLd);
  try {
    meta.appHtml = renderToStaticMarkup(
      <StaticRouter location={url}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </StaticRouter>
    );
  } finally {
    __setSSRMetaSink(null);
    __setSSRJsonLdSink(null);
  }
  return { ...meta, jsonLd };
}
