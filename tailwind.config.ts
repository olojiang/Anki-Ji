import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), muted: v("muted"), border: v("border"),
        fg: v("fg"), sub: v("sub"), faint: v("faint"),
        primary: v("primary"), "primary-fg": v("primary-fg"), accent: v("accent"),
        again: v("again"), hard: v("hard"), good: v("good"), easy: v("easy"),
      },
      fontFamily: { sans: ["'Inter Variable'", "Inter", "system-ui", "-apple-system", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "'Noto Sans CJK SC'", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.02)", pop: "0 12px 32px -8px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.06)" },
      borderRadius: { xl: "0.875rem" },
    },
  },
  plugins: [],
  safelist: ["text-again", "text-hard", "text-good", "text-easy", "bg-again", "bg-hard", "bg-good", "bg-easy", "border-again", "border-hard", "border-good", "border-easy"],
} satisfies Config;
