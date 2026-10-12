/**
 * Theme registry (visual only). Token values live in src/app/globals.css under
 * [data-theme="<id>"]; this file holds metadata for the picker + the no-flash
 * boot script. Rule: no purple / indigo / blue-violet in any theme.
 */
import { THEME_IDS, type ThemeId } from "@/core/settings";

export type Theme = ThemeId;
export interface ThemeMeta { id: Exclude<ThemeId, "system">; zh: string; en: string; dark: boolean; swatch: { bg: string; surface: string; primary: string; fg: string; accent2: string } }

export const THEMES: ThemeMeta[] = [
  { id: "light", zh: "浅色", en: "Light", dark: false, swatch: { bg: "#fafafa", surface: "#ffffff", primary: "#0f7f76", fg: "#111113", accent2: "#e6e6e9" } },
  { id: "dark", zh: "深色", en: "Dark", dark: true, swatch: { bg: "#09090b", surface: "#111113", primary: "#2dd4bf", fg: "#f4f4f5", accent2: "#27272b" } },
  { id: "gold", zh: "黑金", en: "Black Gold", dark: true, swatch: { bg: "#0a0907", surface: "#14120e", primary: "#d4af37", fg: "#f5eedc", accent2: "#302b21" } },
  { id: "orange", zh: "暖橙", en: "Warm Orange", dark: false, swatch: { bg: "#fcfaf7", surface: "#ffffff", primary: "#c2410c", fg: "#1c1611", accent2: "#eae3da" } },
  { id: "redblack", zh: "红黑", en: "Red Black", dark: true, swatch: { bg: "#080809", surface: "#121112", primary: "#dc2626", fg: "#f5f3f3", accent2: "#2c2829" } },
  { id: "ink", zh: "墨绿", en: "Ink Green", dark: true, swatch: { bg: "#080e0c", surface: "#0d1613", primary: "#34d399", fg: "#e8f0ec", accent2: "#1f302a" } },
  { id: "paper", zh: "护眼", en: "Paper", dark: false, swatch: { bg: "#f4ecd8", surface: "#faf4e4", primary: "#156e62", fg: "#34281a", accent2: "#ded1b4" } },
];

export const DARK_THEMES = THEMES.filter((t) => t.dark).map((t) => t.id);
export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);

/** Resolve "system" to a concrete theme id. */
export function resolveTheme(theme: Theme, prefersDark: boolean): ThemeMeta["id"] {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

/** Inline boot script (runs before paint): no theme flash on load. */
export const themeBootScript = `try{var t=localStorage.getItem('ak-theme')||'light';var ok=${JSON.stringify([...THEME_IDS])};if(ok.indexOf(t)<0)t='light';if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var d=document.documentElement;d.setAttribute('data-theme',t);var bg=${JSON.stringify(Object.fromEntries(THEMES.map((x) => [x.id, x.swatch.bg])))}[t];document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.setAttribute('content',bg)});if(${JSON.stringify(DARK_THEMES)}.indexOf(t)>=0)d.classList.add('dark')}catch(e){}`;
