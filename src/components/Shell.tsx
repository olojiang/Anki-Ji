"use client";
/**
 * App frame, responsive by breakpoint:
 *  - < md (phones):   sticky top header + bottom tab bar (safe-area aware) + slide-over "more" drawer
 *  - md..lg (tablet): 72px icon rail
 *  - ≥ lg (desktop):  full sidebar
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Layers, Plus, Search, BarChart3, Tags, ArrowLeftRight, Trash2, Settings, LogOut, Languages, Menu, X, MoreHorizontal, Sparkles } from "lucide-react";
import { ta } from "@/lib/i18n-ai";
import { useApp } from "./providers";
import { Logo, LogoMark } from "./AuthForm";
import { api } from "@/lib/api";
import { cx } from "./ui";
import { ThemeMenu } from "./ThemePicker";
import { isTheme } from "@/lib/themes";

export interface Me { id: number; email: string; name: string; settings: { timezone: string; rolloverHour: number; locale: "zh" | "en"; theme: string } }

type NavItem = { href: string; icon: typeof Layers; label: string; match?: (p: string) => boolean };

export function Shell({ children }: { children: ReactNode }) {
  const { t, setTheme, locale, setLocale } = useApp();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    api<{ user: Me }>("/api/auth/me").then((r) => {
      setMe(r.user);
      // adopt the account's saved theme on a fresh device (localStorage wins once set)
      const saved = r.user.settings?.theme;
      if (!localStorage.getItem("ak-theme") && isTheme(saved) && saved !== "light") setTheme(saved);
    }).catch(() => {});
  }, [setTheme]);
  useEffect(() => setOpen(false), [path]);
  // hide the bottom tab bar while the on-screen keyboard is likely open
  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "range", "file", "button", "submit"].includes((el as HTMLInputElement).type)) || el.isContentEditable);
    const on = (e: FocusEvent) => isField(e.target) && setTyping(true);
    const off = () => setTimeout(() => setTyping(isField(document.activeElement)), 50);
    window.addEventListener("focusin", on); window.addEventListener("focusout", off);
    return () => { window.removeEventListener("focusin", on); window.removeEventListener("focusout", off); };
  }, []);

  const decks: NavItem = { href: "/", icon: Layers, label: t("navDecks"), match: (p) => p === "/" || p.startsWith("/study") || p.startsWith("/decks") };
  const add: NavItem = { href: "/add", icon: Plus, label: t("navAdd") };
  const browse: NavItem = { href: "/browse", icon: Search, label: t("navBrowse"), match: (p) => p.startsWith("/browse") || p.startsWith("/notes") };
  const stats: NavItem = { href: "/stats", icon: BarChart3, label: t("navStats") };
  const secondary: NavItem[] = [
    { href: "/tags", icon: Tags, label: t("navTags") },
    { href: "/io", icon: ArrowLeftRight, label: t("navIO") },
    { href: "/ai", icon: Sparkles, label: ta(locale, "navAi") },
    { href: "/trash", icon: Trash2, label: t("navTrash") },
    { href: "/settings", icon: Settings, label: t("navSettings") },
  ];
  const groups = [[decks, add, browse, stats], secondary];
  const isActive = (n: NavItem) => (n.match ? n.match(path) : path.startsWith(n.href));
  const logout = async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/login"; };
  const toggleLocale = () => { const l = locale === "zh" ? "en" : "zh"; setLocale(l); api("/api/auth/me", { method: "PATCH", body: { settings: { locale: l } } }).catch(() => {}); };
  const initial = (me?.name || me?.email || "·").trim().charAt(0).toUpperCase();
  const studying = path.startsWith("/study");

  const Avatar = ({ className }: { className?: string }) => (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-fg shadow-inner ring-1 ring-inset ring-black/10", className)}>{initial}</span>
  );

  const side = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Link href="/" className="focus-ring inline-flex h-11 items-center rounded-md"><Logo /></Link></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-0.5">
            {g.map((n) => {
              const active = isActive(n);
              return (
                <Link key={n.href} href={n.href}
                  className={cx("focus-ring group relative flex h-11 items-center gap-3 rounded-lg px-3 text-[14px] transition-[background-color,color] duration-150 lg:h-9 lg:gap-2.5 lg:px-2.5 lg:text-[13.5px]",
                    active ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-border" : "text-sub hover:bg-muted/80 hover:text-fg")}>
                  {active && <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                  <n.icon className={cx("h-[18px] w-[18px] transition-colors lg:h-[17px] lg:w-[17px]", active ? "text-fg" : "text-faint group-hover:text-sub")} strokeWidth={1.9} />{n.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="rounded-xl border border-border bg-surface p-2 shadow-xs">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <Avatar className="h-8 w-8 text-[13px]" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-fg">{me?.name || "—"}</div>
              <div className="truncate text-[11.5px] text-faint" title={me?.email}>{me?.email ?? ""}</div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-0.5 border-t border-border pt-1.5">
            <ThemeMenu placement="up" />
            <button onClick={toggleLocale} className="focus-ring inline-flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-medium text-sub transition-colors hover:bg-muted hover:text-fg lg:h-8" title={t("language")}><Languages className="h-4 w-4" />{locale === "zh" ? "EN" : "中"}</button>
            <button onClick={logout} className="focus-ring ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-sub transition-colors hover:bg-rose-500/10 hover:text-danger lg:h-8 lg:w-8" title={t("logout")} aria-label={t("logout")}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );

  const rail = (
    <div className="flex h-full flex-col items-center py-4">
      <Link href="/" className="focus-ring mb-4 rounded-lg" aria-label="Anki-ji"><LogoMark className="h-8 w-8" /></Link>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {groups.map((g, gi) => (
          <div key={gi} className={cx("flex flex-col items-center gap-1", gi > 0 && "mt-3 border-t border-border pt-3")}>
            {g.map((n) => {
              const active = isActive(n);
              return (
                <Link key={n.href} href={n.href} title={n.label} aria-label={n.label}
                  className={cx("focus-ring relative inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors", active ? "bg-surface text-fg shadow-xs ring-1 ring-border" : "text-faint hover:bg-muted hover:text-fg")}>
                  {active && <span className="absolute -left-[14px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
                  <n.icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-1">
        <ThemeMenu placement="up" className="[&>div]:left-0" />
        <button onClick={toggleLocale} className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl text-xs font-medium text-sub hover:bg-muted hover:text-fg" title={t("language")}>{locale === "zh" ? "EN" : "中"}</button>
        <button onClick={logout} className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl text-sub hover:bg-rose-500/10 hover:text-danger" title={t("logout")} aria-label={t("logout")}><LogOut className="h-4 w-4" /></button>
        <Avatar className="mt-2 h-9 w-9 text-[13px]" />
      </div>
    </div>
  );

  const tabs: NavItem[] = [decks, add, browse, stats];
  return (
    <div className="min-h-screen md:pl-[72px] lg:pl-60">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-subtle/80 backdrop-blur-xl lg:block">{side}</aside>
      {/* tablet rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] border-r border-border bg-subtle/80 backdrop-blur-xl md:block lg:hidden">{rail}</aside>
      {/* phone header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-bg/80 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden" style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }}>
        <button onClick={() => setOpen(true)} className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl text-sub hover:bg-muted hover:text-fg" aria-label="menu"><Menu className="h-5 w-5" /></button>
        <Link href="/" className="inline-flex h-11 items-center px-1"><Logo /></Link>
        <ThemeMenu placement="down" className="ml-auto [&>button]:h-11 [&>button]:px-3" />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-zinc-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] animate-slide-in-left border-r border-border bg-subtle pt-[env(safe-area-inset-top)] shadow-hero">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-[calc(0.5rem+env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-xl text-sub hover:bg-muted" aria-label="close"><X className="h-5 w-5" /></button>
            {side}
          </aside>
        </div>
      )}
      <main className={cx("mx-auto w-full px-4 sm:px-6 lg:px-12 lg:py-10 2xl:px-16",
        studying ? "max-w-6xl 2xl:max-w-7xl" : "max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1600px] min-[2200px]:max-w-[1920px]",
        studying ? "py-4 md:py-8" : "py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10")}>{children}</main>
      {/* phone bottom tab bar */}
      {!studying && !typing && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-elevated/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="tabs">
          <div className="mx-auto grid h-16 max-w-md grid-cols-5">
            {tabs.map((n) => {
              const active = isActive(n);
              return (
                <Link key={n.href} href={n.href} className={cx("relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95", active ? "text-primary-strong" : "text-faint")}>
                  {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-primary" />}
                  {n.href === "/add"
                    ? <span className={cx("inline-flex h-7 w-11 items-center justify-center rounded-full", active ? "bg-primary text-primary-fg" : "bg-muted text-sub")}><n.icon className="h-[18px] w-[18px]" strokeWidth={2.2} /></span>
                    : <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />}
                  {n.label}
                </Link>
              );
            })}
            <button onClick={() => setOpen(true)} className={cx("flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-faint active:scale-95", secondary.some(isActive) && "text-primary-strong")}>
              <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.8} />{t("more")}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
