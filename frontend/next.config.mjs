import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// Build-time settings read by the browser code (src/brand.ts,
// src/utils/analytics.ts). They keep their historical VITE_ prefix so the
// existing env files (.env.production.local on the server...) still apply.
const PUBLIC_ENV = [
  "VITE_BRAND_NAME",
  "VITE_BRAND_DOMAIN",
  "VITE_HOSTING_COUNTRY",
  "VITE_HOSTING_PROVIDER",
  "VITE_AI_PROVIDER",
  "VITE_CREDIT_NAME",
  "VITE_CREDIT_URL",
  "VITE_LEGAL_PUBLISHER",
  "VITE_LEGAL_DIRECTOR",
  "VITE_ANALYTICS_ENDPOINT",
  "VITE_ANALYTICS_SITE_KEY",
];

/** @type {(phase: string) => import("next").NextConfig} */
export default function nextConfig(phase) {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    // Each public route is written as a directory (out/faq/index.html):
    // nginx serves /faq/ and 301-redirects /faq to it (see nginx.conf).
    trailingSlash: true,
    // ...but in-app links keep exactly the URL they were written with
    // (/login stays /login, /faq/ stays /faq/), as before the move to
    // Next.js.
    skipTrailingSlashRedirect: true,
    env: Object.fromEntries(PUBLIC_ENV.map((key) => [key, process.env[key] ?? ""])),
    images: { unoptimized: true },
    ...(dev
      ? {
          // Dev server only: the API runs separately (docker compose).
          async rewrites() {
            const target = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";
            return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
          },
        }
      : {
          // Production is a plain static site served by nginx
          // (Dockerfile + nginx.conf): no Node server.
          output: "export",
        }),
  };
}
