"use client";
import { buildTree, flattenTree } from "@/core/tree";
import type { DeckDTO } from "@/lib/types";
import { Select } from "./ui";

export function deckOptions(decks: DeckDTO[], includeFiltered = false) {
  return flattenTree(buildTree(decks.filter((d) => includeFiltered || !d.filtered)));
}

export function DeckPicker({ decks, value, onChange, className, placeholder }: { decks: DeckDTO[]; value: number | null; onChange: (id: number) => void; className?: string; placeholder?: string }) {
  return (
    <Select className={className} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {deckOptions(decks).map((d) => <option key={d.id} value={d.id}>{"\u00A0\u00A0".repeat(d.depth) + (d.depth ? "└ " : "") + d.name}</option>)}
    </Select>
  );
}
