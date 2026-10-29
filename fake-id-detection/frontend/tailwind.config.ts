import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), sidebar: v("sidebar"), card: v("card"), line: v("line"),
        ink: v("ink"), muted: v("muted"),
        primary: "#3B82F6", accent: "#8B5CF6", success: "#22C55E", warn: "#F59E0B", danger: "#EF4444",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      borderRadius: { card: "16px" },
      boxShadow: { card: "0 8px 24px -12px rgb(0 0 0 / 0.5)" },
    },
  },
  plugins: [],
} satisfies Config;
