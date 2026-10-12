"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type DictKey, type Locale } from "@/lib/i18n";

type Theme = "light" | "dark" | "system";
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
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function Providers({ children, initialLocale = "zh" }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<Theme>("light");
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const l = localStorage.getItem("ak-locale") as Locale | null;
    if (l === "en" || l === "zh") setLocaleState(l);
    const th = localStorage.getItem("ak-theme") as Theme | null;
    if (th) setThemeState(th);
  }, []);
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  useEffect(() => { applyTheme(theme); }, [theme]);

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
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((x) => (
          <div key={x.id} className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-pop ${x.kind === "error" ? "border-again/30 bg-surface text-again" : "border-border bg-surface text-fg"}`}>{x.text}</div>
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
