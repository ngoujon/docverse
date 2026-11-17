// Runs after `next build` (static export in out/). Next.js has already
// written one HTML file per route, with each page's own title, description,
// canonical and structured data in <head> (pages/_document.tsx). This
// checks those, then writes what depends on the deployment rather than on
// the code: sitemap.xml, robots.txt's Sitemap line and nginx's CSP.
import nextEnv from "@next/env";
import { readFile, writeFile, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "out");

// Same env files as the build (.env.production[.local], .env...).
nextEnv.loadEnvConfig(root, false, { info: () => {}, error: console.error });
const env = process.env;
const siteOrigin = env.SITE_ORIGIN
  ? env.SITE_ORIGIN.replace(/\/$/, "")
  : env.VITE_BRAND_DOMAIN
    ? `https://${env.VITE_BRAND_DOMAIN}`
    : "http://localhost";

// Public, indexable routes. Trailing slash on purpose: each route is a
// directory (out/faq/index.html), so nginx 301-redirects /faq to /faq/ and
// only the slashed form answers 200. Sitemap and canonical checks derive
// from this list.
const ROUTES = ["/", "/demo/", "/faq/", "/confidentialite/", "/cgu/", "/mentions-legales/"];

// Account and signed-in routes: static shells, kept out of the index.
const PRIVATE_FILES = [
  "login/index.html",
  "register/index.html",
  "forgot-password/index.html",
  "reset-password/index.html",
  "verify-email/index.html",
  "oauth-callback/index.html",
  "newsletter/confirm/index.html",
  "newsletter/unsubscribe/index.html",
  "dashboard/index.html",
  "account/index.html",
  "admin/index.html",
  "app/index.html",
  "app/[spaceId]/index.html",
  "share/[shareToken]/index.html",
];

const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
const isNoindex = (html) => /<meta name="robots" content="noindex, nofollow"/.test(html);

async function main() {
  for (const route of ROUTES) {
    const html = await readFile(path.join(outDir, route, "index.html"), "utf-8");
    // A canonical that differs from the URL actually served (e.g. missing
    // its trailing slash) points crawlers at a redirect: fail the build.
    if (canonicalOf(html) !== `${siteOrigin}${route}`) {
      throw new Error(`${route}: canonical is ${canonicalOf(html) ?? "missing"}, expected ${siteOrigin}${route}`);
    }
    if (isNoindex(html)) throw new Error(`${route}: public page marked noindex`);
  }

  // "Page not found", served by nginx with a real 404 status for every path
  // the app doesn't know.
  const notFound = await readFile(path.join(outDir, "404.html"), "utf-8");
  if (!isNoindex(notFound) || canonicalOf(notFound)) {
    throw new Error("404 page must be noindex and have no canonical");
  }
  // trailingSlash also writes it as out/404/index.html, which would answer
  // /404/ with a 200: only the nginx error page is wanted.
  await rm(path.join(outDir, "404"), { recursive: true, force: true });

  for (const file of PRIVATE_FILES) {
    const html = await readFile(path.join(outDir, file), "utf-8");
    if (!isNoindex(html) || canonicalOf(html)) throw new Error(`${file}: must be noindex without canonical`);
  }
  console.log(`checked ${ROUTES.length} public pages, 404 and ${PRIVATE_FILES.length} private shells`);

  await writeSitemap();
  await writeRobots();
  await writeNginxConf();
}

// Priorites par route pour le sitemap. Une route absente prend 0.7.
const ROUTE_PRIORITY = { "/": "1.0", "/demo/": "0.9", "/faq/": "0.8" };

// Genere out/sitemap.xml a partir de ROUTES plutot que de maintenir a la
// main un fichier statique dans public/ : le domaine y etait code en dur et
// devenait faux des qu'il changeait, et une route prerendue pouvait etre
// oubliee du sitemap.
async function writeSitemap() {
  const urls = ROUTES.map((route) => {
    const loc = `${siteOrigin}${route}`;
    const priority = ROUTE_PRIORITY[route] ?? "0.7";
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  await writeFile(path.join(outDir, "sitemap.xml"), xml, "utf-8");
  console.log(`sitemap ${ROUTES.length} routes -> ${siteOrigin}`);
}

// The Sitemap directive must be an absolute URL (a bare /sitemap.xml is
// ignored by crawlers), and the origin is deployment configuration.
async function writeRobots() {
  const file = path.join(outDir, "robots.txt");
  const robots = await readFile(file, "utf-8");
  await writeFile(file, robots.replaceAll("__SITE_ORIGIN__", siteOrigin), "utf-8");
}

// nginx.conf's CSP must allow the analytics collector, whose address is
// deployment configuration rather than code: fill it in here and let the
// Dockerfile ship the generated file.
async function writeNginxConf() {
  const endpoint = env.VITE_ANALYTICS_ENDPOINT;
  const origin = endpoint ? ` ${new URL(endpoint).origin}` : "";
  const conf = await readFile(path.join(root, "nginx.conf"), "utf-8");
  await writeFile(path.join(root, "nginx.generated.conf"), conf.replaceAll("__ANALYTICS_ORIGIN__", origin), "utf-8");
}

await access(outDir).catch(() => {
  throw new Error("out/ is missing: run `next build` first");
});
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
