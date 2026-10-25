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
        // "Fluent Corp" design system: navy text, indigo actions, thin
        // grey borders. Landing/public pages - always light.
        fluent: {
          navy: "#0a2540",
          text: "#425466",
          muted: "#697386",
          indigo: "#635bff",
          "indigo-dark": "#4b44d6",
          "indigo-soft": "#f0efff",
          line: "#e6ebf1",
          soft: "#f6f9fc",
          green: "#0e8a4a",
          "green-soft": "#e8f8ef",
        },
        // Legacy landing palette, remapped onto Fluent Corp so any page
        // still using it stays on-brand.
        retro: {
          bg: "#ffffff",
          bg2: "#f6f9fc",
          panel: "#ffffff",
          border: "#e6ebf1",
          pink: "#635bff",
          cyan: "#4b44d6",
          orange: "#b25e09",
          yellow: "#b25e09",
          purple: "#635bff",
        },
        // Blue-grey neutrals aligned on Fluent Corp (slate-900 = navy,
        // slate-600 = secondary text) so the whole app shares the palette.
        slate: {
          50: "#f6f9fc",
          100: "#eef2f7",
          200: "#e3e8ee",
          300: "#c1c9d2",
          400: "#8792a2",
          500: "#697386",
          600: "#425466",
          700: "#30445a",
          800: "#1a3350",
          900: "#0a2540",
          950: "#061b31",
        },
      },
      fontFamily: {
        sans: [
          "Inter Variable",
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
        card: "0 2px 5px -1px rgba(50,50,93,0.08), 0 1px 3px -1px rgba(0,0,0,0.1)",
        "card-lg": "0 50px 100px -20px rgba(50,50,93,0.25), 0 30px 60px -30px rgba(0,0,0,0.3)",
        panel: "0 13px 27px -5px rgba(50,50,93,0.18), 0 8px 16px -8px rgba(0,0,0,0.2)",
        neon: "0 30px 60px -25px rgba(99,91,255,0.45)",
        "neon-light": "0 1px 2px rgba(10,37,64,0.12), 0 2px 6px -2px rgba(99,91,255,0.35)",
        focus: "0 0 0 3px rgba(99,91,255,0.15)",
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
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "draw-line": {
          "0%": { strokeDashoffset: 40 },
          "100%": { strokeDashoffset: 0 },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        pulse2: "pulse2 1.4s ease-in-out infinite",
        "grid-scroll": "grid-scroll 6s linear infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        marquee: "marquee 22s linear infinite",
        blink: "blink 1s step-start infinite",
        float: "float 3.2s ease-in-out infinite",
        "draw-line": "draw-line 2s linear infinite",
      },
    },
  },
  plugins: [],
};
