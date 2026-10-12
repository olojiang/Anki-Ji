"use client";
import { useState } from "react";
import Link from "next/link";
import { Brain, Layers, ArrowLeftRight, Languages } from "lucide-react";
import { useApp } from "./providers";
import { api } from "@/lib/api";
import { Button, Field, Input } from "./ui";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden><rect width="32" height="32" rx="8" className="fill-primary" /><rect x="8" y="9" width="16" height="11" rx="2.5" fill="#fff" opacity=".55" transform="rotate(-8 16 14)" /><rect x="8" y="12" width="16" height="11" rx="2.5" fill="#fff" /><path d="M12.5 17.5l2.3 2.3 4.7-4.7" className="stroke-primary" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Anki-ji
    </span>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t, err, locale, setLocale } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api(`/api/auth/${mode}`, { body: mode === "login" ? { email, password } : { email, password, name, locale, timezone: tz } });
      window.location.href = "/";
    } catch (e2) { err(e2); setBusy(false); }
  };
  const points = [
    { icon: Brain, text: t("heroPoint1") },
    { icon: Layers, text: t("heroPoint2") },
    { icon: ArrowLeftRight, text: t("heroPoint3") },
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-gradient-to-br from-teal-50 via-bg to-emerald-50 p-12 dark:from-teal-950/40 dark:via-bg dark:to-emerald-950/30 lg:flex lg:flex-col">
        <Logo className="text-lg" />
        <div className="my-auto max-w-md">
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight">{t("tagline")}</h1>
          <ul className="mt-8 space-y-4">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-[15px] text-sub">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><p.icon className="h-4 w-4" /></span>
                {p.text}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-xl border border-border bg-surface/80 p-5 shadow-card backdrop-blur">
            <div className="text-xs font-medium uppercase tracking-wider text-faint">FSRS-6</div>
            <div className="mt-2 font-mono text-[13px] leading-6 text-sub">R(t) = (1 + factor · t / S)<sup>−w₂₀</sup></div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              {[["again", "1m"], ["hard", "6m"], ["good", "10m"], ["easy", "3d"]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-bg py-2"><div className={`font-medium text-${k}`}>{t(k)}</div><div className="text-faint">{v}</div></div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-faint">© Anki-ji</p>
      </aside>
      <main className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden"><Logo /></span>
          <button onClick={() => setLocale(locale === "zh" ? "en" : "zh")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-sub hover:bg-muted"><Languages className="h-4 w-4" />{locale === "zh" ? "English" : "中文"}</button>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <h2 className="text-2xl font-semibold tracking-tight">{mode === "login" ? t("welcomeBack") : t("createAccount")}</h2>
          <p className="mt-1.5 text-sm text-sub">{mode === "login" ? t("loginSub") : t("registerSub")}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "register" && <Field label={t("name")}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></Field>}
            <Field label={t("email")}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            <Field label={t("password")} hint={mode === "register" ? t("passwordHint") : undefined}><Input type="password" required minLength={mode === "register" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
            <Button variant="primary" size="lg" className="w-full" loading={busy} type="submit">{mode === "login" ? t("login") : t("register")}</Button>
          </form>
          <p className="mt-6 text-center text-sm text-sub">
            {mode === "login" ? t("noAccount") : t("haveAccount")}{" "}
            <Link className="font-medium text-primary hover:underline" href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? t("register") : t("login")}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
