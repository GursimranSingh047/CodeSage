/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // CodeSage Black + White + Green Identity System
        cs: {
          bg: "#080909",             // Main Background
          secondary: "#101211",      // Secondary Background
          surface: "#151716",        // Elevated Surface
          border: "#292D2A",         // Technical Border
          "border-light": "#363C38", // Hover / active border
          text: "#F4F5F4",           // Primary text
          muted: "#A5AAA6",          // Secondary text
          dim: "#666C68",            // Muted text
          green: {
            DEFAULT: "#8CFF8C",      // Primary Green
            hover: "#72E672",
            secondary: "#52D96B",    // Secondary Green
            deep: "#16351F",         // Deep Green
            glow: "rgba(140, 255, 140, 0.15)",
            subtle: "rgba(140, 255, 140, 0.08)",
          },
          danger: {
            DEFAULT: "#FF5555",
            subtle: "rgba(255, 85, 85, 0.12)",
            border: "rgba(255, 85, 85, 0.3)",
          },
          warning: {
            DEFAULT: "#FFB84D",
            subtle: "rgba(255, 184, 77, 0.12)",
            border: "rgba(255, 184, 77, 0.3)",
          },
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '"Geist"',
          '"Plus Jakarta Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5)",
        elevated: "0 8px 24px -4px rgba(0, 0, 0, 0.6)",
        "green-subtle": "0 0 20px rgba(140, 255, 140, 0.18)",
        "green-glow": "0 0 35px rgba(140, 255, 140, 0.32)",
        "green-ring": "0 0 0 1px rgba(140, 255, 140, 0.4)",
      },
    },
  },
  plugins: [],
};