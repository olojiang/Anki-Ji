"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, AlertCircle } from "lucide-react";
import { translate, type DictKey, type Locale } from "@/lib/i18n";

import { DARK_THEMES, isTheme, resolveTheme, type Theme } from "@/lib/themes";
interface Toast { id: number; text: string; kind: "ok" | "error" }
interface Ctx {
  locale: Locale; setLocale: (l: Locale) => void;
  theme: Theme; setTheme: (t: Theme) => void;
  t: (k: DictKey | string, v?: Record<string, string | number>) => string;
  toast: (text: string, kind?: "ok" | "error") => void;
  err: (e: unknown) => void;
}
const C = createContext<Ctx | null>(null);

export function applyTheme(theme: Theme) {
  const id = resolveTheme(theme, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const d = document.documentElement;
  d.setAttribute("data-theme", id);
  d.classList.toggle("dark", (DARK_THEMES as string[]).includes(id));
}

export function Providers({ children, initialLocale = "zh" }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<Theme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const l = localStorage.getItem("ak-locale") as Locale | null;
    if (l === "en" || l === "zh") setLocaleState(l);
    const th = localStorage.getItem("ak-theme");
    if (isTheme(th)) setThemeState(th);
    setThemeReady(true);
  }, []);
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  useEffect(() => {
    if (!themeReady) return; // the boot script already applied the stored theme; avoid a flash
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [theme, themeReady]);

  const setLocale = useCallback((l: Locale) => { setLocaleState(l); localStorage.setItem("ak-locale", l); document.cookie = `ak-locale=${l};path=/;max-age=31536000`; }, []);
  const setTheme = useCallback((th: Theme) => { setThemeState(th); localStorage.setItem("ak-theme", th); }, []);
  const t = useCallback((k: DictKey | string, v?: Record<string, string | number>) => translate(locale, k, v), [locale]);
  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, text, kind }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3200);
  }, []);
  const err = useCallback((e: unknown) => {
    const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : "error");
    const key = `e_${code}`;
    const msg = translate(locale, key);
    toast(msg === key ? `${translate(locale, "error")} (${code})` : msg, "error");
  }, [locale, toast]);

  const value = useMemo(() => ({ locale, setLocale, theme, setTheme, t, toast, err }), [locale, setLocale, theme, setTheme, t, toast, err]);
  return (
    <C.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((x) => (
          <div key={x.id} className="pointer-events-auto flex animate-scale-in items-center gap-2.5 rounded-xl border border-border bg-elevated/95 py-2.5 pl-3 pr-4 text-[13.5px] text-fg shadow-pop backdrop-blur-xl">
            {x.kind === "error"
              ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15 text-danger"><AlertCircle className="h-3.5 w-3.5" /></span>
              : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-success"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>}
            {x.text}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}

export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("Providers missing");
  return c;
}
