import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests only: the app itself is built by Next.js (next.config.mjs).
export default defineConfig({
  plugins: [react()],
  test: {
    env: {
      VITE_ANALYTICS_ENDPOINT: "https://analytics.example.test/collect",
      VITE_ANALYTICS_SITE_KEY: "tk_test",
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
