"use client";
import { useEffect, useState } from "react";
import { Replace } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Segmented, Spinner, Toggle, cx } from "@/components/ui";
import { ALL_TEXT_FIELDS } from "@/core/batch";
import { useTm } from "@/components/modes/common";

interface Preview { notes: number; matches: number; samples: { noteId: number; field: string; before: string; after: string }[] }

export function FindReplaceModal({ open, onClose, selectedIds, query, resultCount, onDone }: {
  open: boolean; onClose: () => void; selectedIds: number[]; query: string; resultCount: number; onDone: (r: { undoId: number | null; message: string }) => void;
}) {
  const { t, fail } = useTm();
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [regex, setRegex] = useState(false);
  const [cs, setCs] = useState(false);
  const [fields, setFields] = useState<string[] | "all">("all");
  const [scope, setScope] = useState<"selected" | "results">(selectedIds.length ? "selected" : "results");
  const [pv, setPv] = useState<Preview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setScope(selectedIds.length ? "selected" : "results"); }, [open, selectedIds.length]);
  const payload = () => ({ ...(scope === "selected" ? { noteIds: selectedIds } : { query }), find, replace: repl, regex, caseSensitive: cs, fields });

  // live preview (debounced)
  useEffect(() => {
    if (!open || !find) { setPv(null); setPvErr(null); return; }
    let live = true;
    setLoading(true);
    const h = setTimeout(async () => {
      try { const r = await api<Preview>("/api/batch/replace", { body: { ...payload(), preview: true } }); if (live) { setPv(r); setPvErr(null); } }
      catch (e) { if (live) { setPv(null); setPvErr((e as Error).message); } }
      finally { if (live) setLoading(false); }
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [open, find, repl, regex, cs, fields, scope, query, selectedIds.join(",")]);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api<Preview & { changed: number; skipped: unknown[]; undoId: number | null }>("/api/batch/replace", { body: payload() });
      const msg = t("replacedN", { m: r.matches, n: r.changed }) + (r.skipped?.length ? ` · ${t("skippedN", { n: r.skipped.length })}` : "");
      onDone({ undoId: r.undoId, message: msg });
      onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const toggleField = (f: string) => {
    const cur = fields === "all" ? [] : fields;
    const next = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
    setFields(next.length ? next : "all");
  };

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Replace className="h-4 w-4 text-primary" />{t("findReplace")}</span>} wide
      footer={<><Button variant="ghost" onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={!pv || !pv.matches} onClick={apply}>{t("replaceAll")}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("find")}><Input autoFocus value={find} onChange={(e) => setFind(e.target.value)} className="font-mono" spellCheck={false} /></Field>
          <Field label={t("replaceWith")} hint={regex ? t("regexHelp") : undefined}><Input value={repl} onChange={(e) => setRepl(e.target.value)} className="font-mono" spellCheck={false} /></Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Toggle checked={regex} onChange={setRegex} label={t("regex")} />
          <Toggle checked={cs} onChange={setCs} label={t("caseSensitive")} />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-sub">{t("inFields")}</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={fields === "all"} onClick={() => setFields("all")}>{t("allFields")}</Chip>
            {ALL_TEXT_FIELDS.map((f) => <Chip key={f} on={fields !== "all" && fields.includes(f)} onClick={() => toggleField(f)}>{t(`f_${f}`)}</Chip>)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-sub">{t("applyTo")}</div>
          <Segmented value={scope} onChange={setScope} className="w-full sm:w-auto" options={[
            ...(selectedIds.length ? [{ value: "selected" as const, label: t("scopeSelected", { n: selectedIds.length }) }] : []),
            { value: "results" as const, label: t("scopeResults", { n: resultCount }) },
          ]} />
        </div>
        <div className="rounded-xl border border-border bg-subtle p-3 text-[13px]">
          {!find ? <span className="text-faint">{t("e_empty_find")}</span> : loading && !pv ? <Spinner className="h-4 w-4" /> : pvErr ? <span className="text-danger">{t(`e_${pvErr}`)}</span> : pv && (
            <div className="space-y-2">
              <div className={cx("font-medium", pv.matches ? "text-fg" : "text-faint")}>{pv.matches ? t("previewCount", { m: pv.matches, notes: pv.notes }) : t("previewNone")}</div>
              {pv.samples.slice(0, 5).map((s, i) => (
                <div key={i} className="grid gap-1 rounded-lg bg-surface p-2 font-mono text-[12px] sm:grid-cols-[72px_1fr]">
                  <span className="text-faint">{t(`f_${s.field}`)}</span>
                  <span className="min-w-0 break-words"><span className="text-danger line-through decoration-danger/50">{clip(s.before)}</span><br /><span className="text-success">{clip(s.after)}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const clip = (s: string) => (s.length > 160 ? `${s.slice(0, 160)}…` : s);

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx("focus-ring inline-flex h-11 items-center rounded-full border px-3 text-[12.5px] transition-colors sm:h-8", on ? "border-primary/60 bg-primary/10 font-medium text-primary-strong" : "border-border bg-surface text-sub hover:border-border-strong hover:text-fg")}>
      {children}
    </button>
  );
}
