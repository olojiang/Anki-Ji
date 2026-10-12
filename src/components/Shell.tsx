"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Layers, Plus, Search, BarChart3, Tags, ArrowLeftRight, Trash2, Settings, LogOut, Languages, Menu, X } from "lucide-react";
import { useApp } from "./providers";
import { Logo } from "./AuthForm";
import { api } from "@/lib/api";
import { cx } from "./ui";
import { ThemeMenu } from "./ThemePicker";
import { isTheme } from "@/lib/themes";

export interface Me { id: number; email: string; name: string; settings: { timezone: string; rolloverHour: number; locale: "zh" | "en"; theme: string } }

export function Shell({ children }: { children: ReactNode }) {
  const { t, setTheme, locale, setLocale } = useApp();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<{ user: Me }>("/api/auth/me").then((r) => {
      setMe(r.user);
      // adopt the account's saved theme on a fresh device (localStorage wins once set)
      const saved = r.user.settings?.theme;
      if (!localStorage.getItem("ak-theme") && isTheme(saved) && saved !== "light") setTheme(saved);
    }).catch(() => {});
  }, [setTheme]);
  useEffect(() => setOpen(false), [path]);
  const groups = [
    [
      { href: "/", icon: Layers, label: t("navDecks"), match: (p: string) => p === "/" || p.startsWith("/study") || p.startsWith("/decks") },
      { href: "/add", icon: Plus, label: t("navAdd") },
      { href: "/browse", icon: Search, label: t("navBrowse"), match: (p: string) => p.startsWith("/browse") || p.startsWith("/notes") },
      { href: "/stats", icon: BarChart3, label: t("navStats") },
    ],
    [
      { href: "/tags", icon: Tags, label: t("navTags") },
      { href: "/io", icon: ArrowLeftRight, label: t("navIO") },
      { href: "/trash", icon: Trash2, label: t("navTrash") },
      { href: "/settings", icon: Settings, label: t("navSettings") },
    ],
  ];
  const logout = async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/login"; };
  const initial = (me?.name || me?.email || "·").trim().charAt(0).toUpperCase();
  const side = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Link href="/" className="focus-ring rounded-md"><Logo /></Link></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-0.5">
            {g.map((n) => {
              const active = n.match ? n.match(path) : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={cx("focus-ring group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-[background-color,color] duration-150",
                    active ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-sub hover:bg-muted/80 hover:text-fg")}>
                  {active && <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                  <n.icon className={cx("h-[17px] w-[17px] transition-colors", active ? "text-fg" : "text-faint group-hover:text-sub")} strokeWidth={1.9} />{n.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-3">
        <div className="rounded-xl border border-border bg-surface p-2 shadow-xs">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-fg shadow-inner ring-1 ring-inset ring-black/10">{initial}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-fg">{me?.name || "—"}</div>
              <div className="truncate text-[11.5px] text-faint" title={me?.email}>{me?.email ?? ""}</div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-0.5 border-t border-border pt-1.5">
            <ThemeMenu placement="up" />
            <button onClick={() => { const l = locale === "zh" ? "en" : "zh"; setLocale(l); api("/api/auth/me", { method: "PATCH", body: { settings: { locale: l } } }).catch(() => {}); }} className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-sub transition-colors hover:bg-muted hover:text-fg" title={t("language")}><Languages className="h-4 w-4" />{locale === "zh" ? "EN" : "中"}</button>
            <button onClick={logout} className="focus-ring ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub transition-colors hover:bg-rose-500/10 hover:text-danger" title={t("logout")} aria-label={t("logout")}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-subtle/80 backdrop-blur-xl lg:block">{side}</aside>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/75 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-sub hover:bg-muted hover:text-fg" aria-label="menu"><Menu className="h-5 w-5" /></button>
        <Link href="/"><Logo /></Link>
        <ThemeMenu placement="down" className="ml-auto" />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-zinc-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in-left border-r border-border bg-subtle shadow-hero">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub hover:bg-muted" aria-label="close"><X className="h-4 w-4" /></button>
            {side}
          </aside>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl animate-fade-in px-4 py-6 sm:px-6 lg:px-12 lg:py-10">{children}</main>
    </div>
  );
}
