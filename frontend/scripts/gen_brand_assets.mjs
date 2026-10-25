/**
 * Regenerates the raster brand assets from public/favicon.svg: the social
 * share image (og-image.png, 1200x630), the iOS home-screen icon, a 512px
 * icon (structured-data logo) and a 32px PNG favicon fallback.
 *
 * Usage (Playwright is not a project dependency, it is fetched on demand):
 *   npx -y -p playwright@1 node scripts/gen_brand_assets.mjs
 * Uses the locally installed Google Chrome (channel "chrome").
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = resolve(ROOT, "public");
// npx -p puts playwright on NODE_PATH, which bare ESM imports ignore.
const { chromium } = createRequire(import.meta.url)("playwright");

const toData = (mime, buf) => `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
const svg = readFileSync(resolve(PUB, "favicon.svg"), "utf8");
const markData = toData("image/svg+xml", svg);
const squareMarkData = toData("image/svg+xml", svg.replace(' rx="8"', ""));
const interData = toData(
  "font/woff2",
  readFileSync(resolve(ROOT, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")),
);

const ogHtml = `<!doctype html><html><head><style>
@font-face{font-family:Inter;src:url(${interData}) format("woff2");font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:Inter;background:#fff;color:#0a2540;position:relative;overflow:hidden}
.stripe{position:absolute;left:0;right:0;top:-560px;height:900px;transform:skewY(-12deg);transform-origin:0;
background:radial-gradient(40% 60% at 30% 70%,#a960ee 0%,transparent 70%),radial-gradient(35% 60% at 55% 80%,#ff6b8b 0%,transparent 70%),radial-gradient(35% 55% at 78% 70%,#ffcb57 0%,transparent 70%),radial-gradient(40% 60% at 95% 60%,#90e0ff 0%,transparent 70%),linear-gradient(90deg,#635bff,#a960ee 35%,#ff6b8b 60%,#ffcb57 82%,#90e0ff);
-webkit-mask-image:linear-gradient(90deg,transparent 15%,rgba(0,0,0,.55) 50%,#000 75%)}
.wrap{position:absolute;left:88px;top:150px;right:88px}
.logo{display:flex;align-items:center;gap:18px;font-size:46px;font-weight:700;letter-spacing:-.045em}
.logo img{width:60px;height:60px}
h1{margin-top:56px;font-size:64px;line-height:1.08;font-weight:600;letter-spacing:-.035em}
h1 span{color:#635bff}
.chips{margin-top:36px;display:flex;gap:12px}
.chip{background:#f0efff;color:#4b44d6;font-weight:600;font-size:20px;padding:8px 18px;border-radius:999px}
</style></head><body><div class="stripe"></div><div class="wrap">
<div class="logo"><img src="${markData}">docverse</div>
<h1>Le RAG souverain,<br><span>hébergé en France.</span></h1>
<div class="chips"><span class="chip">IA Mistral</span><span class="chip">OVHcloud</span><span class="chip">Aucune donnée hors UE</span></div>
</div></body></html>`;

const iconHtml = (size, src) =>
  `<!doctype html><html><body style="margin:0;background:transparent"><img src="${src}" style="display:block;width:${size}px;height:${size}px"></body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
async function shoot(html, width, height, file, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(PUB, file), omitBackground: transparent });
  await page.close();
  console.log("wrote", file);
}

await shoot(ogHtml, 1200, 630, "og-image.png");
// iOS adds its own rounded mask and ignores transparency: full-bleed square.
await shoot(iconHtml(180, squareMarkData), 180, 180, "apple-touch-icon.png");
await shoot(iconHtml(512, markData), 512, 512, "icon-512.png", true);
await shoot(iconHtml(32, markData), 32, 32, "favicon-32.png", true);
await browser.close();
