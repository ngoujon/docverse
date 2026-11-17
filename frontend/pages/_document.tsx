import Document, { Head, Html, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { HeadSinkContext, type HeadSink } from "../src/headSink";

/** Public origin of the deployment (canonical/OG URLs), taken from
 * SITE_ORIGIN or VITE_BRAND_DOMAIN at build time - never hardcoded. */
function siteOrigin(): string {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/$/, "");
  return process.env.VITE_BRAND_DOMAIN ? `https://${process.env.VITE_BRAND_DOMAIN}` : "http://localhost";
}

const DEFAULT_TITLE = "Docverse - RAG souverain hébergé en France, un espace par client";
const DEFAULT_DESCRIPTION =
  "Solution cloud RAG souveraine : vos documents hébergés en France chez OVHcloud, une IA française Mistral, aucune donnée hors Union européenne. Un espace cloisonné par client, accès révocable.";
const DEFAULT_OG_DESCRIPTION =
  "Votre solution cloud RAG souveraine : hébergement français OVHcloud, moteur d'IA Mistral, vos données ne quittent jamais l'Union européenne. Réponses sourcées, un espace par client.";
const DEFAULT_TWITTER_DESCRIPTION =
  "RAG souverain hébergé en France : IA Mistral, données hors CLOUD Act. Pensé pour les cabinets, agences et équipes qui gèrent plusieurs clients.";

const SOFTWARE_APPLICATION = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Docverse",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (navigateur web) - service géré, hébergé en France",
  description:
    "Docverse est une solution cloud RAG souveraine : vos documents (PDF, scans, images, DOCX, pages web) sont interrogés par une IA française Mistral, sur une infrastructure hébergée en France chez OVHcloud. Espaces cloisonnés par client, rôles et accès révocables, aucune donnée transférée hors Union européenne.",
  featureList: [
    "Espaces cloisonnés par client ou projet, avec rôles lecture seule ou édition",
    "Accès révocable à tout moment, avec délai de sécurité avant réinvitation",
    "Ingestion de PDF, images, pages web, DOCX, TXT, Markdown, avec OCR par vision IA sur les scans",
    "Réponses IA sourcées",
    "Recherche web auto-hébergée, sans traceur ni clé API tierce",
    "Hébergement en France chez OVHcloud, hors champ du CLOUD Act américain",
    "Moteur d'IA français (Mistral AI), aucune requête hors Union européenne",
    "Documents et questions jamais utilisés pour entraîner un modèle",
    "Transcription audio exécutée sur notre propre infrastructure",
    "Authentification Google SSO et vérification en deux étapes (2FA)",
    "Sauvegardes automatiques par espace, restaurables par un administrateur",
  ],
};

/** JSON for an inline <script type="application/ld+json">: a "</script>"
 * substring (e.g. an FAQ answer mentioning a <script> tag) must not close
 * the tag early. */
function jsonLdHtml(data: object): string {
  return JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
}

type Props = DocumentInitialProps & { pageHead: HeadSink };

/** The HTML document around every page, written once per route at build
 * time (static export). Each page reports its own title, description,
 * canonical and structured data through usePageMeta/useJsonLd while it is
 * rendered (see src/headSink.ts); this writes them into <head> so a
 * crawler reading the HTML without running JS gets the real values. */
export default class DocverseDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const pageHead: HeadSink = { jsonLd: [] };
    const originalRenderPage = ctx.renderPage;
    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App) =>
          function AppWithHeadSink(props) {
            return (
              <HeadSinkContext.Provider value={pageHead}>
                <App {...props} />
              </HeadSinkContext.Provider>
            );
          },
      });
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps, pageHead };
  }

  render() {
    const { title, description, canonicalPath, noindex, jsonLd } = this.props.pageHead;
    const origin = siteOrigin();
    // A page kept out of the index must not claim the homepage as its
    // canonical: it gets neither canonical nor og:url.
    const canonicalUrl = noindex ? undefined : canonicalPath ? `${origin}${canonicalPath}` : `${origin}/`;
    const pageTitle = title || DEFAULT_TITLE;

    return (
      <Html lang="fr">
        <Head>
          <meta name="theme-color" content="#ffffff" />

          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

          {/* Static per-page title, kept in sync in the browser by usePageMeta. */}
          {/* eslint-disable-next-line @next/next/no-title-in-document-head */}
          <title>{pageTitle}</title>
          <meta name="description" content={description || DEFAULT_DESCRIPTION} />
          <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />

          {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
          <meta property="og:type" content="website" />
          {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
          <meta property="og:site_name" content="Docverse" />
          <meta property="og:title" content={pageTitle} />
          <meta property="og:description" content={description || DEFAULT_OG_DESCRIPTION} />
          <meta property="og:image" content={`${origin}/og-image.png`} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content="Docverse - RAG souverain hébergé en France" />
          <meta property="og:locale" content="fr_FR" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={pageTitle} />
          <meta name="twitter:description" content={description || DEFAULT_TWITTER_DESCRIPTION} />
          <meta name="twitter:image" content={`${origin}/og-image.png`} />
          <meta name="twitter:image:alt" content="Docverse - RAG souverain hébergé en France" />

          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(SOFTWARE_APPLICATION) }} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLdHtml({
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Docverse",
                url: origin,
                logo: `${origin}/icon-512.png`,
              }),
            }}
          />
          {/* Mesure d'audience SEO Monitor (exemptee de consentement, voir /confidentialite/). */}
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script
            defer
            src="https://vps-3962b7dc.vps.ovh.net/seo-monitor/p/s.js"
            data-site="24va3yh9"
            data-mode="cookie"
          />
          {/* Per-route structured data (e.g. FaqPage's FAQPage schema).
              data-prerendered lets useJsonLd reuse these after hydration
              instead of appending a duplicate. */}
          {jsonLd.map((data, i) => (
            <script
              key={i}
              type="application/ld+json"
              data-prerendered=""
              dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
            />
          ))}
        </Head>
        <body className="bg-surface-0 text-slate-900">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
