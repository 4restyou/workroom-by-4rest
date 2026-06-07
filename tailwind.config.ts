import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // These backgrounds are composed at runtime (e.g. `bg-workroom-${color}` in
  // lib/ui.ts and FeatureCard), so Tailwind's content scanner can't see them.
  safelist: [
    "bg-workroom-yellow",
    "bg-workroom-mint",
    "bg-workroom-lilac",
    "bg-workroom-sky",
    "bg-workroom-coral",
    "bg-workroom-danger",
    "bg-workroom-ink",
    "text-white",
    "text-workroom-ink",
  ],
  theme: {
    extend: {
      colors: {
        workroom: {
          background: "#F4EEE1",
          surface: "#FFFFFF",
          ink: "#141414",
          text: "#141414",
          muted: "#5C5A54",
          line: "#E2DAC9",
          yellow: "#F6E76F",
          mint: "#CDE8D6",
          lilac: "#DBD0F7",
          sky: "#C3DDF2",
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
        card: "1.25rem",
        pill: "999px",
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
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "cat-lid": {
          "0%, 88%, 100%": { transform: "scaleY(0)" },
          "92%, 95%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.25s ease-out both",
        "cat-lid": "cat-lid 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
