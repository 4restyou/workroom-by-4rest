import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        workroom: {
          background: "#F7F3EA",
          surface: "#FFFFFF",
          text: "#171717",
          muted: "#5C5A54",
          line: "#D8D0C2",
          yellow: "#F6E76F",
          mint: "#D8E7D5",
          lilac: "#C9B7F4",
          // Deprecated alias: `purple` is actually the mint tone. Kept for
          // backwards compatibility; prefer `mint` in new code.
          purple: "#D8E7D5",
        },
      },
      boxShadow: {
        sketch: "0 18px 45px rgba(23, 23, 23, 0.08)",
        soft: "0 10px 30px rgba(23, 23, 23, 0.06)",
      },
      borderRadius: {
        card: "8px",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
