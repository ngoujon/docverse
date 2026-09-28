import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});
