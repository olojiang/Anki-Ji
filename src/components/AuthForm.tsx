"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Brain, Layers, ArrowLeftRight, Languages, ArrowRight, Flame } from "lucide-react";
import { useApp } from "./providers";
import { api } from "@/lib/api";
import { Button, Field, Input, Kbd, ProgressRing, cx } from "./ui";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  const gid = `ak-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: "rgb(var(--brand))" }} /><stop offset="1" style={{ stopColor: "rgb(var(--primary))" }} /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity=".22" />
      <rect x="8" y="8.5" width="16" height="11" rx="2.5" fill="#fff" opacity=".45" transform="rotate(-9 16 14)" />
      <rect x="8" y="12" width="16" height="11" rx="2.5" fill="#fff" />
      <path d="M12.5 17.5l2.3 2.3 4.7-4.7" style={{ stroke: "rgb(var(--primary))" }} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-[-0.02em] ${className}`}>
      <LogoMark />
      Anki-ji
    </span>
  );
}

/** Decorative product visual for the auth hero: a live-looking study card + stats. */
function ProductVisual() {
  const { t } = useApp();
  const ratings: [string, string, string][] = [["again", "1m", "bg-rose-400"], ["hard", "6m", "bg-amber-400"], ["good", "3d", "bg-emerald-400"], ["easy", "8d", "bg-sky-400"]];
  const heat = [0, 1, 2, 1, 3, 2, 0, 2, 3, 4, 2, 1, 3, 4, 1, 2, 4, 3, 2, 4, 4, 0, 1, 3, 2, 4, 3, 4];
  const shade = ["bg-white/[0.06]", "bg-brand/25", "bg-brand/45", "bg-brand/70", "bg-brand"];
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden>
      {/* back card: stats */}
      <div className="absolute -right-4 -top-10 w-[230px] rotate-[4deg] rounded-2xl border border-white/10 bg-zinc-900/80 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-400">{t("heroRetention")}</span>
          <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-400/20">+2.4%</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <ProgressRing value={0.92} size={44} stroke={4} className="[&_circle:first-child]:stroke-white/10 [&_circle:last-child]:stroke-brand" />
          <div>
            <div className="font-mono text-[22px] font-semibold tracking-tight text-white">92.4%</div>
            <div className="text-[10.5px] text-zinc-500">{t("target")} 90%</div>
          </div>
        </div>
        <div className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
          {heat.map((h, i) => <span key={i} className={cx("aspect-square rounded-[3px]", shade[h])} />)}
        </div>
      </div>
      {/* deck stack shadow layers */}
      <div className="absolute inset-x-6 -bottom-3 h-full rounded-[22px] border border-white/[0.06] bg-zinc-900/60" />
      <div className="absolute inset-x-3 -bottom-1.5 h-full rounded-[22px] border border-white/[0.08] bg-zinc-900/80" />
      {/* main study card */}
      <div className="relative rounded-[22px] border border-white/10 bg-gradient-to-b from-zinc-800/90 to-zinc-900/95 p-6 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl">
        <div className="flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 font-medium text-zinc-300 ring-1 ring-inset ring-white/10"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />GRE · Vocabulary</span>
          <span className="font-mono text-zinc-500">12 / 40</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[30%] rounded-full bg-gradient-to-r from-brand to-brand-2" /></div>
        <div className="py-7 text-center">
          <div className="text-[30px] font-semibold tracking-[-0.02em] text-white">ephemeral</div>
          <div className="mt-1 font-mono text-[12.5px] text-zinc-500">/ɪˈfem(ə)rəl/</div>
          <div className="mx-auto my-4 h-px w-16 bg-white/10" />
          <div className="text-[15px] text-zinc-200">短暂的；转瞬即逝的</div>
          <div className="mt-1 text-[12.5px] italic text-zinc-500">Fame in the age of social media is ephemeral.</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ratings.map(([k, v, dot], i) => (
            <div key={k} className={cx("rounded-xl border px-2 py-2 text-center", i === 2 ? "border-brand/40 bg-brand/10" : "border-white/[0.08] bg-white/[0.03]")}>
              <div className="font-mono text-[10.5px] text-zinc-500">{v}</div>
              <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-200"><span className={cx("h-1.5 w-1.5 rounded-full", dot)} />{t(k)}</div>
            </div>
          ))}
        </div>
      </div>
      {/* floating chip */}
      <div className="absolute -bottom-8 -left-6 flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-400/15 text-orange-300 ring-1 ring-inset ring-orange-400/20"><Flame className="h-3.5 w-3.5" /></span>
        <div className="leading-tight">
          <div className="text-[10.5px] text-zinc-500">{t("heroStreak")}</div>
          <div className="font-mono text-[13px] font-semibold text-white">42 <span className="font-sans text-[11px] font-normal text-zinc-400">{t("days")}</span></div>
        </div>
      </div>
    </div>
  );
}

/** Same-origin path from ?next= (e.g. back to a shared deck after logging in). */
function safeNext(): string | null {
  if (typeof window === "undefined") return null;
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : null;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t, err, locale, setLocale } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => setNext(safeNext()), []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api(`/api/auth/${mode}`, { body: mode === "login" ? { email, password } : { email, password, name, locale, timezone: tz } });
      window.location.href = safeNext() ?? "/";
    } catch (e2) { err(e2); setBusy(false); }
  };
  const points = [
    { icon: Brain, text: t("heroPoint1"), tone: "text-brand bg-brand/10 ring-brand/20" },
    { icon: Layers, text: t("heroPoint2"), tone: "text-sky-300 bg-sky-400/10 ring-sky-400/20" },
    { icon: ArrowLeftRight, text: t("heroPoint3"), tone: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  ];
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.08fr_1fr]">
      {/* ── Hero (always dark, product visual) ── */}
      <aside className="relative hidden overflow-hidden bg-zinc-950 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-brand/20 blur-[120px]" />
          <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-brand-2/10 blur-[120px]" />
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_40%_40%,black_20%,transparent_70%)]" />
        </div>
        <div className="relative flex h-full flex-col px-12 py-10 xl:px-16">
          <Logo className="text-[17px] text-white" />
          <div className="my-auto grid gap-10 py-6">
            <div className="max-w-[520px] animate-rise-in">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] font-medium text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_2px_rgb(var(--brand)/0.6)]" />FSRS-6 · Spaced Repetition
              </span>
              <h1 className="mt-5 text-display font-semibold">
                <span className="block bg-gradient-to-b from-white to-zinc-300 bg-clip-text text-transparent">{t("heroTitleA")}</span>
                <span className="block bg-gradient-to-r from-brand-2 via-brand to-brand bg-clip-text text-transparent">{t("heroTitleB")}</span>
              </h1>
              <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-zinc-400">{t("heroSub")}</p>
              <ul className="mt-7 space-y-3 [@media(max-height:980px)]:hidden">
                {points.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 text-[13.5px] text-zinc-300">
                    <span className={cx("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset", p.tone)}><p.icon className="h-3.5 w-3.5" /></span>
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="animate-card-in pl-6 pr-10 [animation-delay:120ms] [@media(max-height:720px)]:hidden"><ProductVisual /></div>
          </div>
          <p className="relative text-xs text-zinc-500">© Anki-ji · {t("heroFoot")}</p>
        </div>
      </aside>

      {/* ── Form ── */}
      <main className="relative flex flex-col overflow-hidden p-6 sm:p-10">
        <div className="bg-dots mask-fade-b pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60" />
        <div className="relative flex items-center justify-between">
          <span className="lg:hidden"><Logo /></span>
          <button onClick={() => setLocale(locale === "zh" ? "en" : "zh")} className="focus-ring ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg border border-transparent px-3 text-[13px] sm:h-9 text-sub transition-colors hover:border-border hover:bg-surface hover:text-fg"><Languages className="h-4 w-4" />{locale === "zh" ? "English" : "中文"}</button>
        </div>
        <div className="relative mx-auto my-auto w-full max-w-[380px] animate-rise-in py-12">
          <div className="mb-8 lg:hidden">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em]">{t("heroTitleA")}<span className="text-primary">{t("heroTitleB")}</span></h1>
          </div>
          <h2 className="text-[24px] font-semibold tracking-[-0.025em]">{mode === "login" ? t("welcomeBack") : t("createAccount")}</h2>
          <p className="mt-1.5 text-[14px] text-sub">{mode === "login" ? t("loginSub") : t("registerSub")}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "register" && <Field label={t("name")}><Input className="sm:h-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></Field>}
            <Field label={t("email")}><Input className="sm:h-10" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></Field>
            <Field label={t("password")} hint={mode === "register" ? t("passwordHint") : undefined}><Input className="sm:h-10" type="password" required minLength={mode === "register" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="••••••••" /></Field>
            <Button variant="primary" size="lg" className="group mt-2 w-full" loading={busy} type="submit">
              {mode === "login" ? t("login") : t("register")}
              {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </Button>
          </form>
          <div className="my-7 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-border" />Anki-ji<span className="h-px flex-1 bg-border" /></div>
          <p className="text-center text-[13.5px] text-sub">
            {mode === "login" ? t("noAccount") : t("haveAccount")}{" "}
            <Link className="inline-flex h-11 items-center px-1 font-medium text-primary underline-offset-4 hover:underline sm:h-auto" href={(mode === "login" ? "/register" : "/login") + (next ? `?next=${encodeURIComponent(next)}` : "")}>{mode === "login" ? t("register") : t("login")}</Link>
          </p>
          <p className="mt-10 hidden items-center justify-center gap-1.5 text-xs text-faint sm:flex"><Kbd>Enter</Kbd> {mode === "login" ? t("login") : t("register")}</p>
        </div>
      </main>
    </div>
  );
}
