import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
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
