"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Palette } from "lucide-react";
import { useApp } from "./providers";
import { api } from "@/lib/api";
import { THEMES, type Theme, type ThemeMeta } from "@/lib/themes";
import { cx } from "./ui";

/** Persist locally (instant, no flash next load) and to the user's settings (best effort). */
export function useChooseTheme() {
  const { setTheme } = useApp();
  return (id: Theme) => {
    setTheme(id);
    api("/api/auth/me", { method: "PATCH", body: { settings: { theme: id } } }).catch(() => {});
  };
}

function MiniPreview({ m }: { m: ThemeMeta }) {
  const s = m.swatch;
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: s.bg }}>
      <div className="absolute inset-y-0 left-0 w-[26%] border-r" style={{ background: s.surface, borderColor: s.accent2 }}>
        <div className="ml-[18%] mt-[18%] h-1.5 w-1.5 rounded-sm" style={{ background: s.primary }} />
        {[0, 1, 2].map((i) => <div key={i} className="ml-[18%] mt-1.5 h-[3px] w-[55%] rounded-full opacity-40" style={{ background: s.fg }} />)}
      </div>
      <div className="absolute left-[34%] right-[8%] top-[18%] rounded-[4px] border p-1.5" style={{ background: s.surface, borderColor: s.accent2 }}>
        <div className="h-[3px] w-[60%] rounded-full opacity-80" style={{ background: s.fg }} />
        <div className="mt-1 h-[3px] w-[40%] rounded-full opacity-35" style={{ background: s.fg }} />
        <div className="mt-2 h-2 w-[45%] rounded-[3px]" style={{ background: s.primary }} />
      </div>
    </div>
  );
}

export function Swatch({ m, className }: { m: ThemeMeta; className?: string }) {
  return (
    <span className={cx("relative inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-inset ring-black/15 dark:ring-white/20", className)} style={{ background: m.swatch.bg }}>
      <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: m.swatch.primary }} />
    </span>
  );
}

/** Large grid with live mini previews (Settings page). */
export function ThemeGrid() {
  const { theme, locale, t } = useApp();
  const choose = useChooseTheme();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {THEMES.map((m) => {
        const on = theme === m.id;
        return (
          <button key={m.id} type="button" onClick={() => choose(m.id)} aria-pressed={on}
            className={cx("focus-ring group overflow-hidden rounded-xl border text-left transition-all duration-150 hover:-translate-y-px hover:shadow-md",
              on ? "border-primary shadow-[0_0_0_3px_rgb(var(--primary)/0.18)]" : "border-border hover:border-border-strong")}>
            <div className="aspect-[16/10] w-full border-b border-border"><MiniPreview m={m} /></div>
            <div className="flex items-center gap-2 bg-surface px-2.5 py-2">
              <Swatch m={m} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{locale === "zh" ? m.zh : m.en}</span>
              {on && <Check className="h-3.5 w-3.5 text-primary-strong" strokeWidth={2.5} />}
            </div>
          </button>
        );
      })}
      <button type="button" onClick={() => choose("system")} aria-pressed={theme === "system"}
        className={cx("focus-ring overflow-hidden rounded-xl border text-left transition-all duration-150 hover:-translate-y-px hover:shadow-md",
          theme === "system" ? "border-primary shadow-[0_0_0_3px_rgb(var(--primary)/0.18)]" : "border-border hover:border-border-strong")}>
        <div className="relative aspect-[16/10] w-full border-b border-border">
          <div className="absolute inset-0" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}><MiniPreview m={THEMES[0]} /></div>
          <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}><MiniPreview m={THEMES[1]} /></div>
        </div>
        <div className="flex items-center gap-2 bg-surface px-2.5 py-2">
          <Monitor className="h-4 w-4 text-faint" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{t("system")}</span>
          {theme === "system" && <Check className="h-3.5 w-3.5 text-primary-strong" strokeWidth={2.5} />}
        </div>
      </button>
    </div>
  );
}

/** Compact popover (sidebar footer / mobile header). */
export function ThemeMenu({ placement = "up", className }: { placement?: "up" | "down"; className?: string }) {
  const { theme, locale, t } = useApp();
  const choose = useChooseTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  const cur = THEMES.find((m) => m.id === theme);
  return (
    <div ref={ref} className={cx("relative", className)}>
      <button type="button" onClick={() => setOpen(!open)} title={t("theme")} aria-label={t("theme")} aria-expanded={open}
        className={cx("focus-ring inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sub lg:h-8 lg:px-2 transition-colors hover:bg-muted hover:text-fg", open && "bg-muted text-fg")}>
        <Palette className="h-4 w-4" />
        {cur ? <Swatch m={cur} className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className={cx("absolute z-50 w-52 animate-scale-in rounded-xl border border-border bg-elevated p-1 shadow-pop", placement === "up" ? "bottom-10 left-0 origin-bottom-left" : "right-0 top-10 origin-top-right")}>
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-faint">{t("theme")}</div>
          {THEMES.map((m) => (
            <button key={m.id} type="button" onClick={() => { choose(m.id); setOpen(false); }}
              className={cx("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-muted", theme === m.id ? "font-medium text-fg" : "text-sub")}>
              <Swatch m={m} />
              <span className="flex-1">{locale === "zh" ? m.zh : m.en}</span>
              {theme === m.id && <Check className="h-3.5 w-3.5 text-primary-strong" strokeWidth={2.5} />}
            </button>
          ))}
          <div className="-mx-1 my-1 border-t border-border" />
          <button type="button" onClick={() => { choose("system"); setOpen(false); }}
            className={cx("flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-muted", theme === "system" ? "font-medium text-fg" : "text-sub")}>
            <Monitor className="h-4 w-4" /><span className="flex-1">{t("system")}</span>
            {theme === "system" && <Check className="h-3.5 w-3.5 text-primary-strong" strokeWidth={2.5} />}
          </button>
        </div>
      )}
    </div>
  );
}
