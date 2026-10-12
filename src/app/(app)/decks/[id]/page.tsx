"use client";
import { use, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Sparkles, RotateCcw } from "lucide-react";
import { useApp } from "@/components/providers";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, PageHeader, Select, Spinner, Toggle, cx } from "@/components/ui";
import type { DeckDTO } from "@/lib/types";
import type { DeckConfig } from "@/core/types";

const fmtSteps = (s: number[]) => s.map((m) => (m >= 1440 && m % 1440 === 0 ? `${m / 1440}d` : m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`)).join(" ");
const parseSteps = (s: string) => s.split(/[\s,]+/).filter(Boolean).map((x) => {
  const m = /^(\d+(?:\.\d+)?)([smhd]?)$/i.exec(x.trim());
  if (!m) return NaN;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  return u === "d" ? n * 1440 : u === "h" ? n * 60 : u === "s" ? n / 60 : n;
}).filter((n) => Number.isFinite(n) && n > 0);

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export default function DeckOptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, err, toast } = useApp();
  const router = useRouter();
  const [deck, setDeck] = useState<DeckDTO | null>(null);
  const [c, setC] = useState<DeckConfig | null>(null);
  const [steps, setSteps] = useState({ learn: "", relearn: "", leitner: "" });
  const [filter, setFilter] = useState<{ query: string; limit: number; order: string } | null>(null);
  const [applyChildren, setApplyChildren] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opt, setOpt] = useState(false);

  useEffect(() => {
    api<{ deck: DeckDTO }>(`/api/decks/${id}`).then((r) => {
      setDeck(r.deck); setC(r.deck.config); setFilter(r.deck.filter);
      setSteps({ learn: fmtSteps(r.deck.config.learningSteps), relearn: fmtSteps(r.deck.config.relearningSteps), leitner: r.deck.config.leitnerIntervals.join(" ") });
    }).catch(err);
  }, [id, err]);
  if (!deck || !c) return <div className="flex justify-center py-20"><Spinner /></div>;
  const set = (p: Partial<DeckConfig>) => setC({ ...c, ...p });
  const num = (k: keyof DeckConfig, step = 1) => <Input type="number" step={step} value={String(c[k])} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<DeckConfig>)} />;

  const save = async () => {
    setBusy(true);
    try {
      const config = { ...c, learningSteps: parseSteps(steps.learn), relearningSteps: parseSteps(steps.relearn), leitnerIntervals: steps.leitner.split(/[\s,]+/).map(Number).filter((n) => n > 0) };
      await api(`/api/decks/${id}`, { method: "PATCH", body: { config, applyToChildren: applyChildren, ...(deck.filtered && filter ? { filter } : {}) } });
      if (deck.filtered) await api(`/api/decks/${id}/rebuild`, { body: {} });
      toast(t("saved")); router.push("/");
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const optimize = async () => {
    setOpt(true);
    try {
      const r = await api<{ ok: boolean; weights?: number[]; items: number; needed?: number; reason?: string }>(`/api/decks/${id}/optimize`, { body: {} });
      if (r.ok && r.weights) { set({ fsrsWeights: r.weights }); toast(t("optimizeDone", { n: r.items })); }
      else if (r.reason === "not_enough_reviews") toast(t("notEnough", { n: r.items, need: r.needed ?? 32 }), "error");
      else toast(t("optimizerUnavailable"), "error");
    } catch (e) { err(e); } finally { setOpt(false); }
  };
  const wd = t("weekdays").split(",");

  return (
    <div className="max-w-3xl">
      <PageHeader title={<span className="inline-flex items-center gap-2"><button onClick={() => router.push("/")} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sub hover:bg-muted sm:h-8 sm:w-8"><ArrowLeft className="h-4 w-4" /></button>{t("deckOptions")} · {deck.name}</span>}
        actions={<Button variant="primary" loading={busy} onClick={save}><Save className="h-4 w-4" />{t("save")}</Button>} />
      <div className="space-y-4">
        {deck.filtered && filter && (
          <Section title={t("filteredDeck")} hint={t("filterExamples")}>
            <Field label={t("filterQuery")} className="sm:col-span-2"><Input value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} /></Field>
            <Field label={t("filterLimit")}><Input type="number" value={filter.limit} onChange={(e) => setFilter({ ...filter, limit: Number(e.target.value) })} /></Field>
            <Field label={t("filterOrder")}><Select className="w-full" value={filter.order} onChange={(e) => setFilter({ ...filter, order: e.target.value })}><option value="due">{t("orderDue")}</option><option value="retrievability">{t("orderRetr")}</option><option value="added">{t("orderAdded")}</option><option value="random">{t("orderRandom")}</option></Select></Field>
          </Section>
        )}
        <Section title={t("algorithm")}>
          <Field label={t("algorithm")} className="sm:col-span-2">
            <div className="grid grid-cols-3 gap-2">
              {(["fsrs", "sm2", "leitner"] as const).map((a) => (
                <button key={a} onClick={() => set({ algorithm: a })} className={cx("rounded-xl border px-3 py-3 text-left text-[13.5px] transition-all duration-150", c.algorithm === a ? "border-primary/60 bg-primary/[0.07] font-medium text-fg shadow-[0_0_0_3px_rgb(var(--primary)/0.12)]" : "border-border bg-surface text-sub hover:border-border-strong hover:text-fg")}>
                  {t(a === "fsrs" ? "algoFsrs" : a === "sm2" ? "algoSm2" : "algoLeitner")}
                </button>
              ))}
            </div>
          </Field>
        </Section>
        <Section title={t("dailyLimits")}>
          <Field label={t("newPerDay")}>{num("newPerDay")}</Field>
          <Field label={t("reviewsPerDay")}>{num("reviewsPerDay")}</Field>
        </Section>
        {c.algorithm !== "leitner" && (
          <Section title={t("steps")} hint={t("stepsHelp")}>
            <Field label={t("learningSteps")}><Input value={steps.learn} onChange={(e) => setSteps({ ...steps, learn: e.target.value })} placeholder="1m 10m" /></Field>
            <Field label={t("relearningSteps")}><Input value={steps.relearn} onChange={(e) => setSteps({ ...steps, relearn: e.target.value })} placeholder="10m" /></Field>
            <Field label={t("learnAhead")}>{num("learnAheadMinutes")}</Field>
          </Section>
        )}
        {c.algorithm === "fsrs" && (
          <Section title={t("fsrsSection")}>
            <Field label={`${t("desiredRetention")}: ${c.desiredRetention.toFixed(2)}`} hint={t("retentionHelp")}>
              <input type="range" min={0.7} max={0.99} step={0.01} value={c.desiredRetention} onChange={(e) => set({ desiredRetention: Number(e.target.value) })} className="w-full accent-primary" />
            </Field>
            <Field label={t("maxInterval")}>{num("maxInterval")}</Field>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-medium text-sub">{t("weights")}</span>
              <div className="rounded-xl border border-border bg-subtle p-3 font-mono text-[11.5px] leading-5 text-sub break-all">{c.fsrsWeights ? c.fsrsWeights.join(", ") : t("defaultWeights")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" loading={opt} onClick={optimize}><Sparkles className="h-3.5 w-3.5" />{opt ? t("optimizing") : t("optimize")}</Button>
                {c.fsrsWeights && <Button size="sm" variant="ghost" onClick={() => set({ fsrsWeights: null })}><RotateCcw className="h-3.5 w-3.5" />{t("resetWeights")}</Button>}
              </div>
            </div>
          </Section>
        )}
        {c.algorithm === "sm2" && (
          <Section title={t("sm2Section")}>
            <Field label={t("graduatingInterval")}>{num("graduatingInterval")}</Field>
            <Field label={t("easyInterval")}>{num("easyInterval")}</Field>
            <Field label={t("startingEase")}>{num("startingEase", 0.05)}</Field>
            <Field label={t("easyBonus")}>{num("easyBonus", 0.05)}</Field>
            <Field label={t("hardIntervalF")}>{num("hardInterval", 0.05)}</Field>
            <Field label={t("intervalModifier")}>{num("intervalModifier", 0.05)}</Field>
            <Field label={t("lapseNew")}>{num("lapseNewInterval", 0.05)}</Field>
            <Field label={t("maxInterval")}>{num("maxInterval")}</Field>
          </Section>
        )}
        {c.algorithm === "leitner" && (
          <Section title={t("leitnerSection")}>
            <Field label={t("leitnerSection")} className="sm:col-span-2"><Input value={steps.leitner} onChange={(e) => setSteps({ ...steps, leitner: e.target.value })} placeholder="1 2 4 8 16 32" /></Field>
          </Section>
        )}
        <Section title={t("balanceSection")}>
          <div className="space-y-3 sm:col-span-2">
            <Toggle checked={c.fuzz} onChange={(v) => set({ fuzz: v })} label={t("fuzz")} />
            <Toggle checked={c.loadBalance} onChange={(v) => set({ loadBalance: v })} label={t("loadBalance")} />
          </div>
          <Field label={t("easyDays")} className="sm:col-span-2">
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {c.easyDays.map((w, i) => (
                <div key={i} className="text-center">
                  <div className="mb-1 text-xs text-faint">{wd[i]}</div>
                  <Select className="w-full px-1 text-xs" value={String(w)} onChange={(e) => set({ easyDays: c.easyDays.map((x, j) => (j === i ? Number(e.target.value) : x)) })}>
                    <option value="1">{t("normal")}</option><option value="0.5">{t("reduced")}</option><option value="0">{t("minimum")}</option>
                  </Select>
                </div>
              ))}
            </div>
          </Field>
        </Section>
        <Section title={t("burySection")}>
          <Toggle checked={c.buryNew} onChange={(v) => set({ buryNew: v })} label={t("buryNew")} />
          <Toggle checked={c.buryReview} onChange={(v) => set({ buryReview: v })} label={t("buryReview")} />
        </Section>
        <Section title={t("leechSection")}>
          <Field label={t("leechThreshold")}>{num("leechThreshold")}</Field>
          <Field label={t("leechAction")}><Select className="w-full" value={c.leechAction} onChange={(e) => set({ leechAction: e.target.value as DeckConfig["leechAction"] })}><option value="suspend">{t("leechSuspend")}</option><option value="tag">{t("leechTag")}</option></Select></Field>
        </Section>
        <Section title={t("orderSection")}>
          <Field label={t("newOrder")}><Select className="w-full" value={c.newOrder} onChange={(e) => set({ newOrder: e.target.value as DeckConfig["newOrder"] })}><option value="manual">{t("newManual")}</option><option value="created">{t("newCreated")}</option><option value="random">{t("newRandom")}</option></Select></Field>
          <Field label={t("reviewOrder")}><Select className="w-full" value={c.reviewOrder} onChange={(e) => set({ reviewOrder: e.target.value as DeckConfig["reviewOrder"] })}><option value="due">{t("revDue")}</option><option value="retrievability">{t("revRetr")}</option><option value="random">{t("revRandom")}</option></Select></Field>
          <Field label={t("mix")}><Select className="w-full" value={c.newReviewMix} onChange={(e) => set({ newReviewMix: e.target.value as DeckConfig["newReviewMix"] })}><option value="mix">{t("mixMix")}</option><option value="newFirst">{t("mixNewFirst")}</option><option value="reviewFirst">{t("mixReviewFirst")}</option></Select></Field>
        </Section>
        <Card className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex md:bottom-3 items-center justify-between gap-3 bg-elevated/90 p-3 pl-4 shadow-pop backdrop-blur-xl">
          <Toggle checked={applyChildren} onChange={setApplyChildren} label={t("applyToChildren")} />
          <Button variant="primary" loading={busy} onClick={save}><Save className="h-4 w-4" />{t("save")}</Button>
        </Card>
      </div>
    </div>
  );
}
