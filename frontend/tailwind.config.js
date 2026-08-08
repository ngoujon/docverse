/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#f7f4fb",
          1: "#ffffff",
          2: "#f8f2fc",
          3: "#efe3f7",
          4: "#e1cdf0",
          border: "#e6daf3",
        },
        accent: {
          DEFAULT: "#8b2fd6",
          hover: "#7422bd",
          soft: "#8b2fd61a",
        },
        retro: {
          bg: "#0b0714",
          bg2: "#160c2e",
          panel: "#1c1033",
          border: "#3d2a66",
          pink: "#ff2bd6",
          cyan: "#00f0ff",
          orange: "#ff8a3d",
          yellow: "#ffd400",
          purple: "#a855f7",
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
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        pulse2: "pulse2 1.4s ease-in-out infinite",
        "grid-scroll": "grid-scroll 6s linear infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
