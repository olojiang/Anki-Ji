"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Shapes, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Modal, Select, Spinner } from "@/components/ui";
import { useApp } from "@/components/providers";
import { useTm } from "@/components/modes/common";
import { CONVERTIBLE_TYPES, STOCK_FIELDS, defaultFieldMapping, type FieldMapping } from "@/core/batch";
import type { NoteType } from "@/core/types";

interface Preview { convertible: number; cardsAdded: number; cardsRemoved: number; skipped: { id: number; error: string }[] }

export function ChangeTypeModal({ open, onClose, notes, onDone }: {
  open: boolean; onClose: () => void; notes: { id: number; type: NoteType }[]; onDone: (r: { undoId: number | null; message: string }) => void;
}) {
  const { t, fail } = useTm();
  const app = useApp();
  const noteKey = notes.map((n) => n.id).join(",");
  const types = useMemo(() => [...new Set(notes.map((n) => n.type))], [notes]);
  const from = types.length === 1 ? types[0] : null;
  const supported = !!from && CONVERTIBLE_TYPES.includes(from);
  const targets = CONVERTIBLE_TYPES.filter((x) => x !== from);
  const [to, setTo] = useState<NoteType>(targets[0] ?? "basic");
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const src = from ? STOCK_FIELDS[from] ?? [] : [];
  const dst = STOCK_FIELDS[to] ?? [];

  useEffect(() => { if (open && from && !targets.includes(to)) setTo(targets[0]); }, [open, from]);
  useEffect(() => { setMapping(defaultFieldMapping(src, dst)); }, [from, to]);
  useEffect(() => {
    if (!open || !supported || !Object.keys(mapping).length || !Object.keys(mapping).every((k) => dst.includes(k))) { setPv(null); return; }
    let live = true;
    api<Preview>("/api/batch/change-type", { body: { noteIds: notes.map((n) => n.id), targetType: to, mapping, preview: true } })
      .then((r) => live && setPv(r)).catch((e) => { if (live) { setPv(null); fail(e); } });
    return () => { live = false; };
  }, [open, supported, to, mapping, noteKey, fail]);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api<Preview & { changed: number; undoId: number | null }>("/api/batch/change-type", { body: { noteIds: notes.map((n) => n.id), targetType: to, mapping } });
      onDone({ undoId: r.undoId, message: t("ctDone", { n: r.changed }) + (r.skipped.length ? ` · ${t("ctSkipped", { n: r.skipped.length })}` : "") });
      onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const involvesCloze = from === "cloze" || to === "cloze";

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Shapes className="h-4 w-4 text-primary" />{t("changeType")}</span>}
      footer={<><Button variant="ghost" onClick={onClose}>{t("cancel")}</Button><Button variant="primary" loading={busy} disabled={!pv || !pv.convertible} onClick={apply}>{t("convert")}</Button></>}>
      {!from ? <p className="text-[13.5px] text-sub">{notes.length ? t("ctMixed") : t("selectFirst")}</p> : !supported ? <p className="text-[13.5px] text-sub">{t("ctUnsupported")}</p> : (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex h-11 items-center rounded-lg border border-border bg-muted px-3 text-[13.5px] text-sub sm:h-9">{app.t(`t_${from}`)}</div>
            <ArrowRight className="h-4 w-4 text-faint" />
            <Select value={to} onChange={(e) => setTo(e.target.value as NoteType)} aria-label={t("targetType")}>
              {targets.map((x) => <option key={x} value={x}>{app.t(`t_${x}`)}</option>)}
            </Select>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-sub">{t("fieldMap")}</div>
            <div className="space-y-2">
              {dst.map((f) => (
                <div key={f} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Select value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value || null })} aria-label={`${t("fromField")} → ${t(`f_${f}`)}`}>
                    <option value="">{t("f_empty")}</option>
                    {src.map((s) => <option key={s} value={s}>{t(`f_${s}`)}</option>)}
                  </Select>
                  <ArrowRight className="h-4 w-4 text-faint" />
                  <div className="flex h-11 items-center rounded-lg border border-dashed border-border-strong px-3 text-[13.5px] font-medium sm:h-9">{t(`f_${f}`)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-subtle p-3 text-[13px]">
            {!pv ? <Spinner className="h-4 w-4" /> : (
              <div className="space-y-1.5">
                <div className="font-medium">{t("ctPreview", { n: pv.convertible, a: pv.cardsAdded, r: pv.cardsRemoved })}</div>
                {pv.skipped.length > 0 && <div className="text-warning">{t("ctSkipped", { n: pv.skipped.length })}</div>}
                {pv.cardsRemoved > 0 && <div className="flex items-start gap-1.5 text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("ctRemoveWarn")}</div>}
                {involvesCloze && <div className="flex items-start gap-1.5 text-sub"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />{t("ctClozeWarn")}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
