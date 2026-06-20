import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // These backgrounds are composed at runtime (e.g. `bg-workroom-${color}` in
  // lib/ui.ts and FeatureCard), so Tailwind's content scanner can't see them.
  // Palette is limited to yellow (primary) + sky (secondary) + danger (errors);
  // legacy mint/lilac/coral are collapsed onto these in lib/ui + lib/directory.
  safelist: [
    "bg-workroom-yellow",
    "bg-workroom-sky",
    "bg-workroom-danger",
    "bg-workroom-ink",
    "text-white",
    "text-workroom-ink",
  ],
  theme: {
    extend: {
      colors: {
        workroom: {
          background: "#F7F5EF",
          surface: "#FEFDF9",
          ink: "#111111",
          text: "#111111",
          muted: "#625F58",
          line: "#C8C2B7",
          yellow: "#FFD91A",
          mint: "#CDE8D6",
          lilac: "#DBD0F7",
          sky: "#E8E5DC",
          coral: "#F6CBB8",
          danger: "#F6BDBD",
          // Deprecated alias: `purple` is actually the mint tone.
          purple: "#CDE8D6",
        },
      },
      boxShadow: {
        hard: "3px 3px 0 0 #141414",
        "hard-sm": "2px 2px 0 0 #141414",
        "hard-lg": "5px 5px 0 0 #141414",
        // Legacy aliases kept so older class names still read as the new
        // hard-offset language.
        soft: "2px 2px 0 0 #141414",
        sketch: "4px 4px 0 0 #141414",
      },
      borderRadius: {
        card: "0.625rem",
        pill: "999px",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "Segoe UI",
          "sans-serif",
        ],
        // Display face for headlines. Falls back to the body stack per glyph.
        display: [
          "GmarketSans",
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "Segoe UI",
          "sans-serif",
        ],
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.25s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
