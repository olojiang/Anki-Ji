"use client";
/** Owner-side dialog: create / copy / revoke read-only share links for one deck subtree. */
import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Eye, Link2, Ban, CopyPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Field, IconButton, Modal, Pill, Select, Spinner, Textarea } from "../ui";
import { useSi } from "./useSi";

export interface ShareDTO { id: number; deckId: number; deckName: string; slug: string; description: string; expiresAt: string | null; revokedAt: string | null; viewCount: number; cloneCount: number; createdAt: string; active: boolean }

const EXPIRY: { days: number; key: "expNever" | "exp1" | "exp7" | "exp30" | "exp90" | "exp365" }[] = [
  { days: 0, key: "expNever" }, { days: 1, key: "exp1" }, { days: 7, key: "exp7" }, { days: 30, key: "exp30" }, { days: 90, key: "exp90" }, { days: 365, key: "exp365" },
];

export const shareUrl = (slug: string) => (typeof window === "undefined" ? `/s/${slug}` : `${window.location.origin}/s/${slug}`);

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
}

export function ShareDialog({ deck, onClose }: { deck: { id: number; name: string } | null; onClose: () => void }) {
  const { s, t, toast, fail, locale } = useSi();
  const [shares, setShares] = useState<ShareDTO[] | null>(null);
  const [desc, setDesc] = useState("");
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!deck) return;
    try { setShares((await api<{ shares: ShareDTO[] }>(`/api/shares?deckId=${deck.id}`)).shares); } catch (e) { fail(e); }
  }, [deck, fail]);
  useEffect(() => { setShares(null); setDesc(""); setDays(0); load(); }, [load]);

  const create = async () => {
    if (!deck) return;
    setBusy(true);
    try {
      const r = await api<{ share: ShareDTO }>("/api/shares", { body: { deckId: deck.id, description: desc, expiresInDays: days || null } });
      setDesc("");
      await load();
      if (await copyText(shareUrl(r.share.slug))) toast(s("copied"));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const revoke = async (sh: ShareDTO) => {
    if (!confirm(s("revokeQ"))) return;
    try { await api(`/api/shares/${sh.id}`, { method: "PATCH", body: { revoke: true } }); await load(); } catch (e) { fail(e); }
  };
  const fmt = (d: string) => new Date(d).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <Modal open={!!deck} onClose={onClose} wide title={<span className="inline-flex min-w-0 items-center gap-2"><Link2 className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{s("shareDeck")} · {deck?.name}</span></span>}>
      <p className="text-[13px] leading-relaxed text-sub">{s("shareIntro")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Field label={s("shareDesc")}><Textarea rows={2} maxLength={2000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={s("shareDescPh")} /></Field>
        <Field label={s("shareExpiry")}>
          <Select className="w-full" value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="share-expiry">
            {EXPIRY.map((x) => <option key={x.days} value={x.days}>{s(x.key)}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex justify-end"><Button variant="primary" loading={busy} onClick={create} data-testid="share-create"><Link2 className="h-4 w-4" />{s("createLink")}</Button></div>

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="mb-2 text-[12.5px] font-medium text-sub">{s("existingLinks")}</h3>
        {shares === null ? <div className="flex justify-center py-6"><Spinner /></div> : shares.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong/70 px-4 py-6 text-center text-[13px] text-faint">{s("noLinks")}</p>
        ) : (
          <ul className="space-y-2" data-testid="share-list">
            {shares.map((sh) => {
              const url = shareUrl(sh.slug);
              const status = sh.revokedAt ? "revoked" : sh.active ? "active" : "expired";
              return (
                <li key={sh.id} className="rounded-xl border border-border bg-subtle/60 p-3">
                  <div className="flex items-center gap-2">
                    <Pill tone={status === "active" ? "emerald" : status === "revoked" ? "rose" : "amber"} dot>{s(status)}</Pill>
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-sub" title={url}>{url.replace(/^https?:\/\//, "")}</code>
                    {status === "active" && <>
                      <IconButton label={s("copyLink")} onClick={async () => { if (await copyText(url)) toast(s("copied")); }}><Copy className="h-4 w-4" /></IconButton>
                      <a href={url} target="_blank" rel="noreferrer" className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sub hover:bg-muted hover:text-fg max-sm:h-11 max-sm:w-11" title={s("openLink")} aria-label={s("openLink")}><ExternalLink className="h-4 w-4" /></a>
                      <IconButton label={s("revoke")} onClick={() => revoke(sh)} className="hover:!bg-rose-500/10 hover:!text-danger"><Ban className="h-4 w-4" /></IconButton>
                    </>}
                  </div>
                  {sh.description && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-sub">{sh.description}</p>}
                  <div className="num mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{s("views", { n: sh.viewCount })}</span>
                    <span className="inline-flex items-center gap-1"><CopyPlus className="h-3 w-3" />{s("clones", { n: sh.cloneCount })}</span>
                    <span>{sh.expiresAt ? s("expiresOn", { d: fmt(sh.expiresAt) }) : s("noExpiry")}</span>
                    <span className="ml-auto">{fmt(sh.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end sm:hidden"><Button variant="ghost" onClick={onClose}>{t("close")}</Button></div>
    </Modal>
  );
}
