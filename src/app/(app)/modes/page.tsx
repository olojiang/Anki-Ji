"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Puzzle, PenLine, Shuffle } from "lucide-react";
import { api } from "@/lib/api";
import { Empty, IconChip, Loading, Pill, Segmented, Select, cx, type Tone } from "@/components/ui";
import { useTm, type ModeRecords } from "@/components/modes/common";
import { TestMode } from "@/components/modes/TestMode";
import { MatchGame } from "@/components/modes/MatchGame";
import { SpellMode } from "@/components/modes/SpellMode";
import type { Direction, StudyItem } from "@/core/modes";

type Mode = "test" | "match" | "spell";
const MODES: { id: Mode; icon: typeof Puzzle; tone: Tone; label: string; desc: string }[] = [
  { id: "test", icon: ClipboardCheck, tone: "teal", label: "modeTest", desc: "modeTestDesc" },
  { id: "match", icon: Puzzle, tone: "amber", label: "modeMatch", desc: "modeMatchDesc" },
  { id: "spell", icon: PenLine, tone: "emerald", label: "modeSpell", desc: "modeSpellDesc" },
];

/** Cram modes for a deck (?deck=), a search (?q=) or selected notes (?notes=). Never touches scheduling. */
export default function ModesPage() {
  const { t, fail } = useTm();
  const router = useRouter();
  const [src, setSrc] = useState<URLSearchParams | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [dir, setDir] = useState<Direction>("forward");
  const [data, setData] = useState<{ key: string; title: string; items: StudyItem[]; total: number } | null>(null);
  const [records, setRecords] = useState<ModeRecords>({});
  const [round, setRound] = useState(0);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setSrc(sp);
    const m = sp.get("mode") as Mode | null;
    if (m && MODES.some((x) => x.id === m)) setMode(m);
  }, []);
  const query = useMemo(() => {
    if (!src) return null;
    const p = new URLSearchParams();
    for (const k of ["deck", "q", "notes"]) { const v = src.get(k); if (v != null) { p.set(k, v); break; } }
    p.set("dir", dir);
    return p.toString();
  }, [src, dir]);
  useEffect(() => {
    if (!query) return;
    setData(null);
    api<{ key: string; title: string; items: StudyItem[]; total: number }>(`/api/modes/items?${query}`).then((r) => {
      setData(r); setRound((x) => x + 1);
      api<{ records: ModeRecords }>(`/api/modes/records?key=${encodeURIComponent(r.key)}`).then((x) => setRecords(x.records)).catch(() => {});
    }).catch(fail);
  }, [query, fail]);

  const save = useCallback(async (m: Mode, payload: { ms?: number; score?: number }) => {
    if (!data) return false;
    const r = await api<{ best: boolean; record: ModeRecords[Mode] }>("/api/modes/records", { body: { key: data.key, mode: m, ...payload } });
    setRecords((x) => ({ ...x, [m]: r.record }));
    return r.best;
  }, [data]);

  const pick = (m: Mode | null) => {
    setMode(m);
    const sp = new URLSearchParams(window.location.search);
    if (m) sp.set("mode", m); else sp.delete("mode");
    window.history.replaceState(null, "", `/modes?${sp.toString()}`);
  };

  const title = data ? (src?.get("notes") ? t("selection") : src?.get("q") != null ? t("searchSel", { q: data.title || "*" }) : data.title) : "";
  const back = () => (mode ? pick(null) : router.back());
  const tool = "inline-flex h-11 w-11 items-center justify-center rounded-lg text-sub transition-colors hover:bg-muted hover:text-fg sm:h-8 sm:w-8";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button onClick={back} className={tool} aria-label={t("back")}><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-faint">{t("modes")}</div>
          <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em] sm:text-[22px]">{title || "…"}</h1>
        </div>
        {data && <Pill mono className="hidden sm:inline-flex">{t("itemsN", { n: data.items.length })}</Pill>}
        <Select value={dir} onChange={(e) => setDir(e.target.value as Direction)} className="w-auto" aria-label="direction">
          <option value="forward">{t("dirForward")}</option><option value="reverse">{t("dirReverse")}</option><option value="both">{t("dirBoth")}</option>
        </Select>
      </div>

      {mode && (
        <div className="mb-5 flex justify-center">
          <Segmented value={mode} onChange={(m) => pick(m)} className="w-full sm:w-auto" options={MODES.map((m) => ({ value: m.id, label: t(m.label) }))} />
        </div>
      )}

      {!data ? <Loading /> : data.items.length === 0 ? <Empty icon={<Shuffle />} title={t("noItems")} /> : !mode ? (
        <>
          <p className="mb-4 text-[13px] text-sub">{t("modesHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((m) => {
              const rec = records[m.id];
              return (
                <button key={m.id} onClick={() => pick(m.id)}
                  className={cx("focus-ring group flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md")}>
                  <IconChip tone={m.tone} size="lg"><m.icon /></IconChip>
                  <div>
                    <div className="text-[15px] font-semibold text-fg">{t(m.label)}</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-sub">{t(m.desc)}</div>
                  </div>
                  {rec && <Pill mono className="mt-auto">{t("best")} {m.id === "match" ? `${((rec.bestMs ?? 0) / 1000).toFixed(1)}s` : `${Math.round(rec.bestScore ?? 0)}%`}</Pill>}
                </button>
              );
            })}
          </div>
        </>
      ) : mode === "test" ? <TestMode key={`t${round}`} items={data.items} record={records.test} onFinish={(score) => save("test", { score })} />
        : mode === "match" ? <MatchGame key={`m${round}`} items={data.items} record={records.match} onFinish={(ms) => save("match", { ms })} />
          : <SpellMode key={`s${round}`} items={data.items} record={records.spell} onFinish={(score) => save("spell", { score })} />}
    </div>
  );
}
