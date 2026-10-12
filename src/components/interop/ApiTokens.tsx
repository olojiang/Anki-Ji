"use client";
import { useEffect, useState } from "react";
import { Plug, KeySquare, Copy, Check, Trash2, Download, Puzzle } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { tx } from "@/lib/i18n-interop";
import { Button, Card, CardHeader, Field, IconChip, Input, Modal } from "@/components/ui";

interface TokenRow { id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* clipboard blocked */ } }}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{ok ? done : label}
    </Button>
  );
}

/** Settings card: personal API tokens (AnkiConnect-compatible API) + browser extension download. */
export function ApiTokens() {
  const { locale, err, t } = useApp();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<TokenRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); api<{ tokens: TokenRow[] }>("/api/tokens").then((r) => setTokens(r.tokens)).catch(() => setTokens([])); }, []);
  const endpoint = `${origin}/api/ankiconnect`;
  const fmt = (d: string) => new Date(d).toLocaleDateString(locale === "en" ? "en" : "zh-CN", { year: "numeric", month: "short", day: "numeric" });

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ token: TokenRow & { token: string } }>("/api/tokens", { body: { name: name || "token" } });
      setFresh(r.token.token); setName("");
      const row: TokenRow = { id: r.token.id, name: r.token.name, prefix: r.token.prefix, createdAt: r.token.createdAt, lastUsedAt: r.token.lastUsedAt };
      setTokens((ts) => [row, ...(ts ?? [])]);
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const doRevoke = async () => {
    if (!revoke) return;
    try { await api(`/api/tokens/${revoke.id}`, { method: "DELETE" }); setTokens((ts) => (ts ?? []).filter((x) => x.id !== revoke.id)); setRevoke(null); } catch (e) { err(e); }
  };

  return (
    <Card className="space-y-5 p-5">
      <CardHeader icon={<IconChip tone="teal"><Plug /></IconChip>} title={tx(locale, "apiTitle")} description={tx(locale, "apiDesc")} />
      <Field label={tx(locale, "apiEndpoint")} hint={tx(locale, "apiYomitan")}>
        <div className="flex gap-2">
          <Input readOnly value={endpoint} className="num min-w-0 flex-1" onFocus={(e) => e.target.select()} />
          <CopyButton text={endpoint} label={tx(locale, "apiCopy")} done={tx(locale, "apiCopied")} />
        </div>
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="flex-1" label={tx(locale, "apiTokenName")}>
          <Input value={name} maxLength={60} placeholder={tx(locale, "apiTokenNamePh")} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </Field>
        <Button variant="primary" loading={busy} onClick={create}><KeySquare className="h-4 w-4" />{tx(locale, "apiCreate")}</Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {tokens && !tokens.length && <li className="px-4 py-3 text-[13px] text-faint">{tx(locale, "apiNoTokens")}</li>}
        {(tokens ?? []).map((tk) => (
          <li key={tk.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium">{tk.name} <span className="num ml-1 text-xs font-normal text-faint">{tk.prefix}…</span></div>
              <div className="text-xs text-sub">{tx(locale, "apiCreated", { d: fmt(tk.createdAt) })} · {tk.lastUsedAt ? tx(locale, "apiLastUsed", { d: fmt(tk.lastUsedAt) }) : tx(locale, "apiNeverUsed")}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRevoke(tk)}><Trash2 className="h-3.5 w-3.5" />{tx(locale, "apiRevoke")}</Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-subtle p-4 sm:flex-row sm:items-center">
        <IconChip tone="amber" size="sm"><Puzzle /></IconChip>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{tx(locale, "extTitle")}</div>
          <p className="mt-1 text-xs leading-relaxed text-sub">{tx(locale, "extDesc")}</p>
        </div>
        <a href="/anki-ji-extension.zip" download className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium shadow-xs transition-colors hover:border-border-strong sm:min-h-9">
          <Download className="h-3.5 w-3.5" />{tx(locale, "extDownload")}
        </a>
      </div>
      <Modal open={!!fresh} onClose={() => setFresh(null)} title={tx(locale, "apiNewToken")}
        footer={<Button variant="primary" onClick={() => setFresh(null)}>{t("done")}</Button>}>
        <p className="mb-3 text-[13px] text-sub">{tx(locale, "apiCopyOnce")}</p>
        <div className="flex gap-2">
          <Input readOnly value={fresh ?? ""} className="num min-w-0 flex-1" onFocus={(e) => e.target.select()} />
          <CopyButton text={fresh ?? ""} label={tx(locale, "apiCopy")} done={tx(locale, "apiCopied")} />
        </div>
      </Modal>
      <Modal open={!!revoke} onClose={() => setRevoke(null)} title={tx(locale, "apiRevoke")}
        footer={<><Button variant="ghost" onClick={() => setRevoke(null)}>{t("cancel")}</Button><Button variant="danger" onClick={doRevoke}>{tx(locale, "apiRevoke")}</Button></>}>
        <p className="text-sm text-sub">{tx(locale, "apiRevokeQ", { name: revoke?.name ?? "" })}</p>
      </Modal>
    </Card>
  );
}
