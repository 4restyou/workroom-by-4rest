import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        workroom: {
          background: "#FAF8F1",
          surface: "#FFFFFF",
          text: "#111111",
          muted: "#666666",
          line: "#111111",
          yellow: "#F5E85C",
          purple: "#C9B7F4",
        },
      },
      boxShadow: {
        sketch: "5px 5px 0 #111111",
        soft: "0 12px 30px rgba(17, 17, 17, 0.08)",
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
