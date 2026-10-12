import type { Config } from "tailwindcss";

/**
 * Design tokens live in src/app/globals.css as CSS variables (light + .dark).
 * This file only maps them to Tailwind utilities. Palette rule: teal primary,
 * graphite/zinc neutrals, no purple / indigo / blue-violet anywhere.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

/* Motion tokens → utilities (duration-fast, ease-emphasized, animate-pop-in, …). Keyframes + docs: src/app/motion.css */
const MOTION_DURATION = { fast: "var(--dur-fast)", base: "var(--dur-base)", slow: "var(--dur-slow)" };
const MOTION_EASE = { standard: "var(--ease-standard)", emphasized: "var(--ease-emphasized)", exit: "var(--ease-exit)", spring: "var(--ease-spring)" };
const MOTION_ANIMATION = {
  "page-in": "m-page-in var(--dur-slow) var(--ease-emphasized) both",
  "pop-in": "m-pop-in var(--dur-base) var(--ease-emphasized) backwards",
  "pop-out": "m-pop-out var(--dur-fast) var(--ease-exit) both",
  "sheet-in": "m-sheet-in var(--dur-slow) var(--ease-emphasized) backwards", // backwards: lets drag-to-dismiss transforms apply after entry
  "sheet-out": "m-sheet-out var(--dur-base) var(--ease-exit) both",
  "overlay-in": "m-fade var(--dur-base) var(--ease-standard) both",
  "overlay-out": "m-fade-out var(--dur-base) var(--ease-exit) both",
  "toast-in": "m-toast-in var(--dur-slow) var(--ease-spring) both",
  "toast-out": "m-toast-out var(--dur-base) var(--ease-exit) both",
  "grow-y": "m-grow-y var(--dur-slow) var(--ease-emphasized) both",
};

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
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)", ...MOTION_EASE },
      transitionDuration: MOTION_DURATION,
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(.97) translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "card-in": { from: { opacity: "0", transform: "perspective(1200px) rotateX(6deg) translateY(14px) scale(.985)" }, to: { opacity: "1", transform: "none" } },
        reveal: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } }, // transform+opacity only (no blur repaint)
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
        ...MOTION_ANIMATION,
      },
    },
  },
  plugins: [],
  safelist: [
    "text-again", "text-hard", "text-good", "text-easy", "bg-again", "bg-hard", "bg-good", "bg-easy", "border-again", "border-hard", "border-good", "border-easy",
  ],
} satisfies Config;
