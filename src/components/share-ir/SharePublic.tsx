"use client";
/** Public shared-deck page body: deck facts, sub-deck structure, sample cards (existing renderer) and "Copy to my collection". */
import { useState } from "react";
import Link from "next/link";
import { CopyPlus, Layers, FolderTree, Languages, LogIn, UserPlus, CheckCircle2, ArrowRight, Clock, Sparkles } from "lucide-react";
import { Logo } from "../AuthForm";
import { CardView } from "../CardView";
import { ThemeMenu } from "../ThemePicker";
import { Button, Card, CardHeader, IconChip, Pill, cx } from "../ui";
import { renderCard } from "@/core/notes";
import { api } from "@/lib/api";
import type { PublicShare } from "@/server/services/share";
import { useSi } from "./useSi";

interface CloneResult { rootDeckId: number | null; added: number; skipped: number; cards: number; own: boolean }

function Sample({ sample }: { sample: PublicShare["samples"][number] }) {
  const [revealed, setRevealed] = useState(false);
  const { t, s } = useSi();
  let rendered = null;
  try { rendered = renderCard(sample.type, sample.fields, sample.ord); } catch { rendered = null; }
  if (!rendered) return null;
  return (
    <button type="button" onClick={() => setRevealed(!revealed)} aria-pressed={revealed}
      className="focus-ring group relative flex min-h-[180px] w-full flex-col rounded-2xl border border-border bg-surface px-4 pb-4 pt-9 text-left shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md sm:px-5">
      <span className="absolute left-3 top-3 flex items-center gap-1.5">
        <Pill tone="neutral">{t(`t_${sample.type}`)}</Pill>
        {revealed && <Pill tone="primary">{s("back")}</Pill>}
      </span>
      <div className="pointer-events-none flex flex-1 items-center justify-center [&_.prose-card]:!text-[16px] sm:[&_.prose-card]:!text-[17px]">
        <div className="w-full"><CardView card={rendered} revealed={revealed} picked={[]} /></div>
      </div>
    </button>
  );
}

export function SharePublic({ share, loggedIn }: { share: PublicShare; loggedIn: boolean }) {
  const { s, locale, setLocale, fail } = useSi();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CloneResult | null>(null);
  const next = encodeURIComponent(`/s/${share.slug}`);
  const subdecks = share.decks.length - 1;
  const fmt = (d: string) => new Date(d).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric" });

  const clone = async () => {
    setBusy(true);
    try { setResult(await api<CloneResult>(`/api/s/${share.slug}/clone`, { body: {} })); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const cta = (compact: boolean) => (
    <div className={compact ? "space-y-2" : "space-y-3"} data-testid={compact ? "share-cta-mobile" : "share-cta"}>
      {result ? (
        <div className="animate-reveal rounded-xl border border-success/30 bg-success/[0.07] p-3.5 text-[13.5px] text-fg" data-testid="clone-result">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p>{result.own ? s("cloneOwn") : s("cloneDone", { added: result.added, cards: result.cards, skipped: result.skipped })}</p>
          </div>
          <Link href={result.rootDeckId ? `/study/${result.rootDeckId}` : "/"} className="mt-3 block"><Button variant="primary" className="w-full">{s("openDecks")}<ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      ) : loggedIn ? (
        <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={clone} data-testid="clone-btn"><CopyPlus className="h-4 w-4" />{s("copyToMine")}</Button>
      ) : (
        <div className={cx("grid gap-2", compact && "grid-cols-2")}>
          <Link href={`/login?next=${next}`}><Button variant="primary" size="lg" className="w-full"><LogIn className="h-4 w-4" />{s("loginToCopy")}</Button></Link>
          <Link href={`/register?next=${next}`}><Button variant="secondary" size="lg" className="w-full"><UserPlus className="h-4 w-4" />{s("signupToCopy")}</Button></Link>
        </div>
      )}
      {!compact && <p className="text-xs leading-relaxed text-faint">{s("copyHint")}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-3 sm:px-6 xl:max-w-[1440px]">
          <Link href="/" className="focus-ring inline-flex h-11 items-center rounded-md px-1"><Logo /></Link>
          <span className="ml-3 hidden text-xs text-faint sm:inline">{s("sharedBy")}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeMenu placement="down" className="[&>button]:h-11 [&>button]:px-3 sm:[&>button]:h-9" />
            <button onClick={() => setLocale(locale === "zh" ? "en" : "zh")} className="focus-ring inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] text-sub transition-colors hover:bg-muted hover:text-fg sm:h-9"><Languages className="h-4 w-4" />{locale === "zh" ? "EN" : "中"}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 lg:py-10 lg:pb-12 xl:max-w-[1440px]">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-faint"><Sparkles className="h-3.5 w-3.5 text-primary" />{s("sharedDeck")}</div>
            <h1 className="break-words text-[28px] font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[32px]" data-testid="share-title">{share.name}</h1>
            {share.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-[14.5px] leading-relaxed text-sub">{share.description}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone="primary" mono>{s("cardsN", { n: share.cardCount })}</Pill>
              <Pill tone="sky" mono>{s("notesN", { n: share.noteCount })}</Pill>
              {subdecks > 0 && <Pill tone="amber" mono>{s("subdecksN", { n: subdecks })}</Pill>}
              {share.expiresAt && <Pill tone="neutral"><Clock className="h-3 w-3" />{s("linkExpires", { d: fmt(share.expiresAt) })}</Pill>}
            </div>

            <section className="mt-8">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{s("samples")}</h2>
                <span className="text-xs text-faint">{s("tapToFlip")}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" data-testid="share-samples">
                {share.samples.map((x, i) => <Sample key={i} sample={x} />)}
              </div>
            </section>
          </div>

          <aside className="mt-8 space-y-4 lg:sticky lg:top-24 lg:mt-0">
            <Card className="hidden p-5 lg:block">{cta(false)}</Card>
            <p className="text-xs leading-relaxed text-faint lg:hidden">{s("copyHint")}</p>
            <Card className="p-5">
              <CardHeader className="mb-3" icon={<IconChip tone="teal"><FolderTree /></IconChip>} title={s("structure")} />
              <ul className="space-y-0.5">
                {share.decks.map((d) => (
                  <li key={d.path} className="flex h-9 items-center gap-2 rounded-lg px-2 text-[13.5px] hover:bg-subtle" style={{ paddingLeft: 8 + d.depth * 16 }}>
                    <Layers className={cx("h-3.5 w-3.5 shrink-0", d.depth ? "text-faint" : "text-primary")} />
                    <span className={cx("min-w-0 flex-1 truncate", d.depth === 0 && "font-medium")}>{d.name}</span>
                    <span className="num shrink-0 text-xs text-faint">{d.cards}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </main>

      {/* phone / tablet: sticky call to action */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-elevated/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-pop backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-xl">{cta(true)}</div>
      </div>
    </div>
  );
}
