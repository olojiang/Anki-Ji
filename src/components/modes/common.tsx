"use client";
import { useCallback } from "react";
import { useApp } from "@/components/providers";
import { tm, mbErrorMessage, type MBKey } from "@/lib/i18n-modes-batch";
import type { TypedSegment } from "@/core/typed";
import { cx } from "@/components/ui";

export function useTm() {
  const { locale, err, toast } = useApp();
  const t = useCallback((k: MBKey | string, v?: Record<string, string | number>) => tm(locale, k, v), [locale]);
  /** Like useApp().err but knows batch/mode error codes. */
  const fail = useCallback((e: unknown) => { const m = mbErrorMessage(locale, e); if (m) toast(m, "error"); else err(e); }, [locale, err, toast]);
  return { t, fail, locale };
}

/** Character diff (from core/typed segments): ok = green, wrong = struck red, missing = amber. */
export function DiffView({ segments, className }: { segments: TypedSegment[]; className?: string }) {
  return (
    <span className={cx("break-all font-mono", className)}>
      {segments.map((s, i) => (
        <span key={i} className={s.kind === "ok" ? "text-success" : s.kind === "wrong" ? "rounded-sm bg-danger/15 text-danger line-through" : "rounded-sm bg-warning/15 text-warning"}>{s.text}</span>
      ))}
    </span>
  );
}

export const fmtMs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export interface ModeRecordDTO { bestMs: number | null; bestScore: number | null; plays: number }
export type ModeRecords = Partial<Record<"test" | "match" | "spell", ModeRecordDTO>>;
