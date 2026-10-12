"use client";
import { Markdown } from "./Markdown";
import { cx } from "./ui";
import type { OcclusionMask } from "@/core/types";
import { compareTyped } from "@/core/typed";
import { useApp } from "./providers";
import { Check, X } from "lucide-react";

export interface RenderedCardDTO {
  kind: "plain" | "type" | "mcq" | "occlusion";
  front: string; back: string; showFrontOnBack: boolean;
  typeAnswer?: string; options?: string[]; correct?: number[];
  occlusion?: { image: string; masks: OcclusionMask[]; active: number; mode: "hideOne" | "hideAll" };
}

export function Occlusion({ image, masks, active, mode, revealed }: { image: string; masks: OcclusionMask[]; active: number; mode: "hideOne" | "hideAll"; revealed: boolean }) {
  return (
    <div className="relative mx-auto inline-block max-w-full">
      <img src={image} alt="" className="block max-h-[60vh] max-w-full rounded-lg" />
      {masks.map((m, i) => {
        const isActive = i === active;
        if (!isActive && mode === "hideOne") return null;
        if (isActive && revealed) return <div key={i} className="absolute rounded-md border-2 border-primary" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }} />;
        return (
          <div key={i} className={cx("absolute flex items-center justify-center rounded-md text-sm font-semibold", isActive ? "bg-primary text-primary-fg shadow-lg ring-2 ring-primary/40" : "bg-hard/85 text-white")}
            style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}>{isActive ? "?" : ""}</div>
        );
      })}
    </div>
  );
}

export function CardView({ card, revealed, typed, onTyped, picked, onPick, onSubmitTyped }: {
  card: RenderedCardDTO; revealed: boolean; typed?: string; onTyped?: (v: string) => void; picked?: number[]; onPick?: (i: number) => void; onSubmitTyped?: () => void;
}) {
  const { t } = useApp();
  const multi = (card.correct?.length ?? 0) > 1;
  return (
    <div className="text-center">
      {card.kind === "occlusion" && card.occlusion ? (
        <div className="space-y-4">
          {card.front && <Markdown text={card.front} className="text-lg" />}
          <Occlusion {...card.occlusion} revealed={revealed} />
        </div>
      ) : (
        (!revealed || card.showFrontOnBack) && <Markdown text={card.front} className="text-[19px] sm:text-[21px]" />
      )}

      {card.kind === "mcq" && (
        <div className="mx-auto mt-6 grid max-w-xl gap-2 text-left">
          {card.options?.map((o, i) => {
            const isPicked = picked?.includes(i);
            const isCorrect = card.correct?.includes(i);
            return (
              <button key={i} disabled={revealed} onClick={() => onPick?.(i)}
                className={cx("flex items-start gap-3 rounded-lg border px-4 py-3 text-[15px] transition-colors",
                  !revealed && (isPicked ? "border-primary bg-primary/10" : "border-border hover:bg-muted"),
                  revealed && isCorrect && "border-easy bg-easy/10",
                  revealed && !isCorrect && isPicked && "border-again bg-again/10",
                  revealed && !isCorrect && !isPicked && "border-border opacity-60")}>
                <span className={cx("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-semibold", multi ? "rounded" : "rounded-full", isPicked ? "border-primary bg-primary text-primary-fg" : "border-border text-faint")}>{String.fromCharCode(65 + i)}</span>
                <Markdown text={o} className="min-w-0 flex-1 text-left [&_p]:m-0" />
                {revealed && isCorrect && <Check className="h-4 w-4 text-easy" />}
                {revealed && !isCorrect && isPicked && <X className="h-4 w-4 text-again" />}
              </button>
            );
          })}
          {!revealed && <p className="text-center text-xs text-faint">{t("choose")}</p>}
          {revealed && picked && <p className={cx("text-center text-sm font-medium", sameSet(picked, card.correct ?? []) ? "text-easy" : "text-again")}>{sameSet(picked, card.correct ?? []) ? t("correctPick") : t("wrongPick")}</p>}
        </div>
      )}

      {card.kind === "type" && (
        <div className="mx-auto mt-6 max-w-md">
          {!revealed ? (
            <input autoFocus value={typed ?? ""} onChange={(e) => onTyped?.(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onSubmitTyped?.(); } }}
              placeholder={t("typeAnswerPh")} className="focus-ring h-11 w-full rounded-lg border border-border bg-surface px-3 text-center font-mono text-base" />
          ) : (
            <TypedResult typed={typed ?? ""} expected={card.typeAnswer ?? ""} />
          )}
        </div>
      )}

      {revealed && (
        <>
          {(card.showFrontOnBack || card.kind === "occlusion") && card.back && <hr className="mx-auto my-6 max-w-xl border-border" />}
          {card.back && <Markdown text={card.back} className={cx(card.showFrontOnBack || card.kind === "occlusion" ? "text-[17px] text-fg" : "text-[19px] sm:text-[21px]")} />}
        </>
      )}
    </div>
  );
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

function TypedResult({ typed, expected }: { typed: string; expected: string }) {
  const { t } = useApp();
  const r = compareTyped(typed, expected);
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 text-left font-mono text-[15px]">
      <div className="mb-1 text-xs font-sans text-faint">{t("yourAnswer")}</div>
      <div className="break-all">
        {r.correct ? <span className="text-easy">{typed.trim()}</span> : r.segments.map((s, i) => (
          <span key={i} className={s.kind === "ok" ? "text-easy" : s.kind === "wrong" ? "bg-again/15 text-again line-through" : "bg-hard/15 text-hard"}>{s.text}</span>
        ))}
      </div>
      {!r.correct && <><div className="mb-1 mt-2 text-xs font-sans text-faint">{t("correctAnswer")}</div><div className="break-all text-fg">{expected}</div></>}
    </div>
  );
}
