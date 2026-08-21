// Runs after `vite build`. The app is a client-only SPA (see src/main.tsx),
// so a crawler that doesn't execute JS only ever sees index.html's generic
// title/description and an empty <div id="root">. For the handful of public
// marketing routes (the ones listed in public/sitemap.xml and allowed by
// public/robots.txt), this renders the real React tree to static markup and
// writes it into its own dist/<route>/index.html, with that page's actual
// title/description/canonical baked into <head>. The client bundle still
// loads and takes over normally - this only changes what a non-JS reader of
// the initial response sees.
import { createServer } from "vite";
import { JSDOM } from "jsdom";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const siteOrigin = "https://example.com";

// i18next-browser-languagedetector (pulled in by src/i18n.ts) reads
// window/navigator/localStorage at init time; give it a minimal jsdom global
// so that import doesn't throw under plain Node.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: `${siteOrigin}/` });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node >= 21 defines a read-only global `navigator`; redefine it instead of assigning.
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;

const ROUTES = ["/", "/tarifs", "/demo", "/entreprise", "/faq", "/confidentialite", "/cgu", "/cgv", "/mentions-legales"];

async function main() {
  const template = await readFile(path.join(distDir, "index.html"), "utf-8");

  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
  });

  try {
    const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");

    for (const route of ROUTES) {
      const { appHtml, title, description, canonicalPath } = render(route);
      const html = injectPage(template, { appHtml, title, description, canonicalPath });

      const outDir = route === "/" ? distDir : path.join(distDir, route);
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "index.html"), html, "utf-8");
      console.log(`prerendered ${route}`);
    }
  } finally {
    await vite.close();
  }
}

function injectPage(template, { appHtml, title, description, canonicalPath }) {
  let html = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

  if (title) {
    html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`);
    html = html.replace(
      /(<meta\s+property="og:title"\s+content=").*?(")/s,
      `$1${escapeHtml(title)}$2`
    );
    html = html.replace(
      /(<meta\s+name="twitter:title"\s+content=").*?(")/s,
      `$1${escapeHtml(title)}$2`
    );
  }
  if (description) {
    html = html.replace(
      /(<meta\s+name="description"\s+content=").*?(")/s,
      `$1${escapeHtml(description)}$2`
    );
    html = html.replace(
      /(<meta\s+property="og:description"\s+content=").*?(")/s,
      `$1${escapeHtml(description)}$2`
    );
    html = html.replace(
      /(<meta\s+name="twitter:description"\s+content=").*?(")/s,
      `$1${escapeHtml(description)}$2`
    );
  }
  const canonicalUrl = canonicalPath ? `${siteOrigin}${canonicalPath}` : undefined;
  if (canonicalUrl) {
    html = html.replace(/(<link\s+rel="canonical"\s+href=").*?(")/s, `$1${escapeHtml(canonicalUrl)}$2`);
    html = html.replace(/(<meta\s+property="og:url"\s+content=").*?(")/s, `$1${escapeHtml(canonicalUrl)}$2`);
  }

  return html;
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
