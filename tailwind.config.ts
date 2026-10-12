import type { Config } from "tailwindcss";

/**
 * Design tokens live in src/app/globals.css as CSS variables (light + .dark).
 * This file only maps them to Tailwind utilities. Palette rule: teal primary,
 * graphite/zinc neutrals, no purple / indigo / blue-violet anywhere.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), elevated: v("elevated"), muted: v("muted"), subtle: v("subtle"),
        border: v("border"), "border-strong": v("border-strong"),
        fg: v("fg"), sub: v("sub"), faint: v("faint"),
        primary: v("primary"), "primary-strong": v("primary-strong"), "primary-fg": v("primary-fg"), accent: v("accent"),
        brand: v("brand"), "brand-2": v("brand-2"),
        // ratings
        again: v("again"), hard: v("hard"), good: v("good"), easy: v("easy"),
        // semantic
        success: v("success"), info: v("info"), warning: v("warning"), danger: v("danger"),
      },
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "system-ui", "-apple-system", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "'Noto Sans CJK SC'", "sans-serif"],
        mono: ["'JetBrains Mono Variable'", "'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13.5px", { lineHeight: "20px" }],
        base: ["15px", { lineHeight: "24px" }],
        display: ["clamp(30px, 3.2vw, 44px)", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        card: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-lg)",
        hero: "var(--shadow-xl)",
        "inset-hi": "inset 0 1px 0 0 rgb(255 255 255 / 0.14)",
        glow: "0 0 0 1px rgb(var(--primary) / 0.25), 0 8px 24px -6px rgb(var(--primary) / 0.45)",
      },
      borderRadius: { lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.375rem" },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(.97) translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "card-in": { from: { opacity: "0", transform: "perspective(1200px) rotateX(6deg) translateY(14px) scale(.985)" }, to: { opacity: "1", transform: "none" } },
        reveal: { from: { opacity: "0", transform: "translateY(8px)", filter: "blur(3px)" }, to: { opacity: "1", transform: "none", filter: "none" } },
        "slide-in-left": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: {
        "fade-in": "fade-in .2s ease-out both",
        "rise-in": "rise-in .35s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in .22s cubic-bezier(0.16,1,0.3,1) both",
        "card-in": "card-in .45s cubic-bezier(0.16,1,0.3,1) both",
        reveal: "reveal .4s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-left": "slide-in-left .28s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
  safelist: [
    "text-again", "text-hard", "text-good", "text-easy", "bg-again", "bg-hard", "bg-good", "bg-easy", "border-again", "border-hard", "border-good", "border-easy",
  ],
} satisfies Config;
