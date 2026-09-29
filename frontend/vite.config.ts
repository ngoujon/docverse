import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Public origin of the deployment (canonical/OG URLs in index.html), taken
 * from SITE_ORIGIN or VITE_BRAND_DOMAIN at build time - never hardcoded. */
export function siteOriginFromEnv(env: Record<string, string>): string {
  if (env.SITE_ORIGIN) return env.SITE_ORIGIN.replace(/\/$/, "");
  return env.VITE_BRAND_DOMAIN ? `https://${env.VITE_BRAND_DOMAIN}` : "http://localhost";
}

function siteOriginPlugin(origin: string): Plugin {
  return {
    name: "site-origin",
    transformIndexHtml: (html) => html.split("__SITE_ORIGIN__").join(origin),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), siteOriginPlugin(siteOriginFromEnv(loadEnv(mode, process.cwd(), "")))],
  build: {
    rollupOptions: {
      output: {
        // Separates the vendor libraries (React, the router, i18n) from
        // app code into their own chunk. They change far less often than
        // app code, so browsers keep reusing the cached vendor chunk
        // across deploys instead of re-downloading it inside one 900KB+
        // bundle every time any page changes - this was hurting LCP/INP
        // on the marketing pages, which only need a fraction of the app.
        manualChunks(id: string) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/i18next") ||
            id.includes("node_modules/react-i18next")
          ) {
            return "vendor";
          }
        },
      },
    },
  },
  test: {
    env: {
      VITE_ANALYTICS_ENDPOINT: "https://analytics.example.test/collect",
      VITE_ANALYTICS_SITE_KEY: "tk_test",
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    watch: {
      // Ensures file changes are picked up reliably from a bind-mounted
      // volume inside Docker (inotify events don't always propagate from
      // the host filesystem, especially on macOS/Windows).
      usePolling: true,
      interval: 300,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
}));
