"use client";
/** Shared bits for the incremental reading UI. */
import { Pill, type Tone } from "../ui";
import type { SiKey } from "@/lib/i18n-share-ir";

export interface ReadingSummaryDTO {
  id: number; parentId: number | null; title: string; sourceUrl: string; priority: number; status: "active" | "done"; dueDay: number; intervalDays: number; reps: number;
  position: number; length: number; lastReadAt: string | null; createdAt: string; updatedAt: string;
}
export interface ReadingItemDTO extends ReadingSummaryDTO { content: string; children: ReadingSummaryDTO[] }
export interface ReadingListDTO { items: ReadingSummaryDTO[]; queue: number[]; due: number; overflow: number; cap: number; today: number }

export const priorityTone = (p: number): Tone => (p >= 80 ? "orange" : p >= 60 ? "amber" : p >= 35 ? "teal" : "neutral");

export function PriorityPill({ p, label }: { p: number; label: string }) {
  return <Pill tone={priorityTone(p)} mono title={label}>P{p}</Pill>;
}

export function dueLabel(s: (k: SiKey, v?: Record<string, string | number>) => string, dueDay: number, today: number): string {
  const d = dueDay - today;
  return d === 0 ? s("dueToday") : d > 0 ? s("dueIn", { n: d }) : s("overdue", { n: -d });
}

/** Thin progress bar for reading position. */
export function ReadBar({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-muted ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="h-full rounded-full bg-primary/70 transition-[width] duration-500" style={{ width: `${v * 100}%` }} />
    </div>
  );
}
