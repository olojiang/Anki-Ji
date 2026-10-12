"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Layers, Plus, Search, BarChart3, Tags, ArrowLeftRight, Trash2, Settings, LogOut, Sun, Moon, Languages, Menu, X } from "lucide-react";
import { useApp } from "./providers";
import { Logo } from "./AuthForm";
import { api } from "@/lib/api";
import { cx } from "./ui";

export interface Me { id: number; email: string; name: string; settings: { timezone: string; rolloverHour: number; locale: "zh" | "en"; theme: string } }

export function Shell({ children }: { children: ReactNode }) {
  const { t, theme, setTheme, locale, setLocale } = useApp();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api<{ user: Me }>("/api/auth/me").then((r) => setMe(r.user)).catch(() => {}); }, []);
  useEffect(() => setOpen(false), [path]);
  const nav = [
    { href: "/", icon: Layers, label: t("navDecks"), match: (p: string) => p === "/" || p.startsWith("/study") || p.startsWith("/decks") },
    { href: "/add", icon: Plus, label: t("navAdd") },
    { href: "/browse", icon: Search, label: t("navBrowse"), match: (p: string) => p.startsWith("/browse") || p.startsWith("/notes") },
    { href: "/stats", icon: BarChart3, label: t("navStats") },
    { href: "/tags", icon: Tags, label: t("navTags") },
    { href: "/io", icon: ArrowLeftRight, label: t("navIO") },
    { href: "/trash", icon: Trash2, label: t("navTrash") },
    { href: "/settings", icon: Settings, label: t("navSettings") },
  ];
  const dark = theme === "dark";
  const logout = async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/login"; };
  const side = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4"><Link href="/"><Logo /></Link></div>
      <nav className="flex-1 space-y-0.5 px-2.5 py-2">
        {nav.map((n) => {
          const active = n.match ? n.match(path) : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-sm transition-colors", active ? "bg-muted font-medium text-fg" : "text-sub hover:bg-muted/70 hover:text-fg")}>
              <n.icon className={cx("h-[17px] w-[17px]", active ? "text-primary" : "text-faint")} />{n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => setTheme(dark ? "light" : "dark")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" title={t("theme")}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <button onClick={() => { const l = locale === "zh" ? "en" : "zh"; setLocale(l); api("/api/auth/me", { method: "PATCH", body: { settings: { locale: l } } }).catch(() => {}); }} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-sub hover:bg-muted" title={t("language")}><Languages className="h-4 w-4" />{locale === "zh" ? "EN" : "中"}</button>
          <button onClick={logout} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" title={t("logout")}><LogOut className="h-4 w-4" /></button>
        </div>
        {me && <div className="mt-2 truncate px-1 text-xs text-faint" title={me.email}>{me.name || me.email}</div>}
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-56">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-border bg-surface/60 backdrop-blur lg:block">{side}</aside>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="menu"><Menu className="h-5 w-5" /></button>
        <Logo />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label="close"><X className="h-4 w-4" /></button>
            {side}
          </aside>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}
