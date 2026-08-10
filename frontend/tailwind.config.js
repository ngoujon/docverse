/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables (see index.css :root / .dark) so the app
        // can switch light/dark at runtime without touching every class.
        surface: {
          0: "rgb(var(--surface-0) / <alpha-value>)",
          1: "rgb(var(--surface-1) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
          4: "rgb(var(--surface-4) / <alpha-value>)",
          border: "rgb(var(--surface-border) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          soft: "rgb(var(--accent) / 0.1)",
        },
        // Landing/privacy pages only - always light, not theme-toggled.
        retro: {
          bg: "#fbf9ff",
          bg2: "#f3edff",
          panel: "#ffffff",
          border: "#e5daf7",
          pink: "#e01cc0",
          cyan: "#0891a8",
          orange: "#e06a1f",
          yellow: "#b8860b",
          purple: "#8b2fd6",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        panel: "0 8px 30px rgba(20,10,40,0.12)",
        neon: "0 0 20px rgba(255,43,214,0.35), 0 0 60px rgba(0,240,255,0.15)",
        "neon-light": "0 0 0 1px rgba(139,47,214,0.15), 0 6px 20px rgba(139,47,214,0.18)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0, transform: "translateY(4px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        pulse2: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.4 },
        },
        "grid-scroll": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 64px" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: 0.8 },
          "50%": { opacity: 1 },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        blink: {
          "0%, 49%": { opacity: 1 },
          "50%, 100%": { opacity: 0 },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        pulse2: "pulse2 1.4s ease-in-out infinite",
        "grid-scroll": "grid-scroll 6s linear infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        marquee: "marquee 22s linear infinite",
        blink: "blink 1s step-start infinite",
      },
    },
  },
  plugins: [],
};
