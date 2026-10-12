/**
 * Quizlet-style cram modes (Test / Match / Spell). Pure functions only.
 * These never touch SRS scheduling: callers must not write revlog or card state from here.
 */
import type { NoteFields, NoteType } from "./types";
import { parseCloze, renderCloze, stripCloze } from "./cloze";
import { stripMarkup } from "./notes";
import { compareTyped, type TypedSegment } from "./typed";

/* ─────────── items ─────────── */
export interface StudyItem {
  id: string; // `${noteId}:${ord}` (or `${noteId}:r` for reversed)
  noteId: number;
  prompt: string; // markdown
  answer: string; // markdown
  promptText: string; // plain text
  answerText: string; // plain text
}
export interface SourceNote { id: number; type: NoteType; fields: NoteFields; /** custom notes: field ids in note type order */ fieldOrder?: string[] }
export type Direction = "forward" | "reverse" | "both";

export function itemsFromNotes(notes: SourceNote[], opts: { direction?: Direction } = {}): StudyItem[] {
  const dir = opts.direction ?? "forward";
  const out: StudyItem[] = [];
  const push = (noteId: number, suffix: string, prompt: string, answer: string) => {
    const promptText = stripMarkup(prompt), answerText = stripMarkup(answer);
    if (!promptText || !answerText) return;
    out.push({ id: `${noteId}:${suffix}`, noteId, prompt, answer, promptText, answerText });
  };
  for (const n of notes) {
    const f = n.fields ?? {};
    switch (n.type) {
      case "cloze": {
        const text = f.text ?? "";
        const nodes = parseCloze(text);
        const ords = [...new Set(nodes.map((x) => x.ord))].filter((o) => o > 0).sort((a, b) => a - b);
        for (const ord of ords) {
          const ans = nodes.filter((x) => x.ord === ord).map((x) => stripCloze(x.content)).join(", ");
          push(n.id, String(ord), renderCloze(text, ord, "front"), ans);
        }
        break;
      }
      case "mcq": {
        const opts = f.options ?? [];
        push(n.id, "0", f.question ?? "", (f.correct ?? []).map((i) => opts[i]).filter(Boolean).join(", "));
        break;
      }
      case "image_occlusion": break;
      case "custom": { // custom note types: first two non-empty fields (in note type order)
        const c = f.custom ?? {};
        const ids = n.fieldOrder?.length ? n.fieldOrder.filter((k) => k in c) : Object.keys(c);
        const vals = ids.map((k) => c[k]).filter((v) => typeof v === "string" && stripMarkup(v));
        if (vals.length >= 2) push(n.id, "0", dir === "reverse" ? vals[1] : vals[0], dir === "reverse" ? vals[0] : vals[1]);
        break;
      }
      default: {
        const front = f.front ?? "", back = f.back ?? "";
        if (dir !== "reverse") push(n.id, "0", front, back);
        if (dir === "reverse") push(n.id, "0", back, front);
        if (dir === "both") push(n.id, "r", back, front);
      }
    }
  }
  return out;
}

/* ─────────── randomness ─────────── */
/** Seeded PRNG (mulberry32), returns [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─────────── fuzzy matching ─────────── */
export function normalizeAnswer(s: string): string {
  return stripMarkup(String(s ?? "").normalize("NFKC"))
    .toLowerCase()
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const x = [...a], y = [...b];
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** How many edits still count as a typo for an answer of this length. */
export function typoTolerance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  if (len <= 12) return 2;
  return Math.floor(len * 0.15);
}

export type Verdict = "exact" | "close" | "wrong";
export interface AnswerMatch { verdict: Verdict; correct: boolean; distance: number; expected: string; segments: TypedSegment[] }

/** Compare a typed answer with the expected one. `;`-separated alternatives are each accepted. */
export function matchAnswer(typed: string, expected: string): AnswerMatch {
  const plain = stripMarkup(expected);
  const alts = [plain, ...plain.split(/[;；]/)].map((s) => s.trim()).filter(Boolean);
  const t = normalizeAnswer(typed);
  let best = { alt: alts[0] ?? plain, d: Infinity, norm: "" };
  for (const alt of alts) {
    const norm = normalizeAnswer(alt);
    const d = levenshtein(t, norm);
    if (d < best.d) best = { alt, d, norm };
  }
  const len = [...best.norm].length;
  const verdict: Verdict = !t ? "wrong" : best.d === 0 ? "exact" : best.d <= typoTolerance(len) ? "close" : "wrong";
  const diff = compareTyped(typed, best.alt);
  return { verdict, correct: verdict !== "wrong", distance: best.d, expected: best.alt, segments: diff.segments };
}

/* ─────────── distractors ─────────── */
const isCjk = (s: string) => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(s);
const isNumeric = (s: string) => /^[\d\s.,:/%+-]+$/.test(s);

/** Wrong answers for `target`, drawn from other items: distinct, never equal to the right answer, preferring look-alikes. */
export function pickDistractors(items: StudyItem[], target: StudyItem, n: number, rand: () => number): string[] {
  const right = normalizeAnswer(target.answerText);
  const seen = new Set([right]);
  const tl = [...target.answerText].length;
  const cands: { answer: string; score: number }[] = [];
  for (const it of items) {
    const k = normalizeAnswer(it.answerText);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const l = [...it.answerText].length;
    let score = 1 - Math.abs(l - tl) / Math.max(l, tl, 1);
    if (isCjk(it.answerText) === isCjk(target.answerText)) score += 2;
    if (isNumeric(it.answerText) === isNumeric(target.answerText)) score += 1;
    score += rand() * 0.6; // variety between runs
    cands.push({ answer: it.answer, score });
  }
  return cands.sort((a, b) => b.score - a.score).slice(0, n).map((c) => c.answer);
}

/* ─────────── test mode ─────────── */
export type QuestionKind = "mc" | "tf" | "written";
export const QUESTION_KINDS: QuestionKind[] = ["mc", "tf", "written"];
export interface TestQuestion {
  id: string; kind: QuestionKind; itemId: string; noteId: number;
  prompt: string; answer: string; answerText: string;
  options?: string[]; correctIndex?: number; // mc
  statement?: string; statementTrue?: boolean; // tf: "prompt — statement?"
}
export interface TestResponse { choice?: number; value?: boolean; text?: string }

export function generateTest(items: StudyItem[], opts: { count?: number; kinds?: QuestionKind[]; seed?: number } = {}): TestQuestion[] {
  const rand = rng(opts.seed ?? Date.now());
  const kinds = (opts.kinds?.length ? opts.kinds : QUESTION_KINDS).filter((k) => QUESTION_KINDS.includes(k));
  const count = Math.max(0, Math.min(opts.count ?? 20, items.length));
  const chosen = shuffle(items, rand).slice(0, count);
  const order = shuffle(chosen.map((_, i) => kinds[i % kinds.length]), rand);
  return chosen.map((it, i) => {
    const base = { id: `q${i}`, itemId: it.id, noteId: it.noteId, prompt: it.prompt, answer: it.answer, answerText: it.answerText };
    const kind = order[i];
    if (kind === "mc") {
      const d = pickDistractors(items, it, 3, rand);
      if (!d.length) return { ...base, kind: "written" as const };
      const options = shuffle([it.answer, ...d], rand);
      return { ...base, kind, options, correctIndex: options.indexOf(it.answer) };
    }
    if (kind === "tf") {
      const d = rand() < 0.5 ? pickDistractors(items, it, 1, rand) : [];
      return d.length ? { ...base, kind, statement: d[0], statementTrue: false } : { ...base, kind, statement: it.answer, statementTrue: true };
    }
    return { ...base, kind: "written" as const };
  });
}

export function gradeQuestion(q: TestQuestion, r: TestResponse | null | undefined): { correct: boolean; match?: AnswerMatch } {
  if (!r) return { correct: false };
  if (q.kind === "mc") return { correct: r.choice === q.correctIndex };
  if (q.kind === "tf") return { correct: typeof r.value === "boolean" && r.value === q.statementTrue };
  const match = matchAnswer(r.text ?? "", q.answerText);
  return { correct: match.correct, match };
}

export interface TestScore {
  correct: number; total: number; percent: number;
  byKind: Partial<Record<QuestionKind, { correct: number; total: number }>>;
  mistakes: { index: number; question: TestQuestion; response: TestResponse | null }[];
}
export function scoreTest(questions: TestQuestion[], responses: (TestResponse | null | undefined)[]): TestScore {
  const s: TestScore = { correct: 0, total: questions.length, percent: 0, byKind: {}, mistakes: [] };
  questions.forEach((q, index) => {
    const k = (s.byKind[q.kind] ??= { correct: 0, total: 0 });
    k.total++;
    const r = responses[index] ?? null;
    if (gradeQuestion(q, r).correct) { s.correct++; k.correct++; } else s.mistakes.push({ index, question: q, response: r });
  });
  s.percent = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  return s;
}

/* ─────────── match game ─────────── */
export interface MatchTile { id: string; pairId: string; side: "prompt" | "answer"; text: string }
export const MATCH_PENALTY_MS = 1000;

export function generateMatch(items: StudyItem[], pairs: number, rand: () => number): MatchTile[] {
  // Greedy: an item whose prompt or answer text is already on the board would be ambiguous, so skip it.
  const used = new Set<string>();
  const chosen: StudyItem[] = [];
  for (const it of shuffle(items, rand)) {
    if (chosen.length >= pairs) break;
    const p = normalizeAnswer(it.promptText), a = normalizeAnswer(it.answerText);
    if (!p || !a || p === a || used.has(p) || used.has(a)) continue;
    used.add(p); used.add(a); chosen.push(it);
  }
  return shuffle(chosen.flatMap((it) => [
    { id: `${it.id}#p`, pairId: it.id, side: "prompt" as const, text: it.promptText },
    { id: `${it.id}#a`, pairId: it.id, side: "answer" as const, text: it.answerText },
  ]), rand);
}
export const matchFinalTime = (elapsedMs: number, misses: number) => Math.round(elapsedMs + misses * MATCH_PENALTY_MS);
export const isBetterTime = (prev: number | null | undefined, ms: number) => prev == null || ms < prev;

/* ─────────── spell / write mode ─────────── */
export interface SpellState { queue: string[]; attempts: Record<string, number>; missed: string[]; done: string[] }
export const spellInit = (ids: string[]): SpellState => ({ queue: [...ids], attempts: {}, missed: [], done: [] });
/** Answer the current (head) item. Wrong answers go to the back of the queue to be retried. */
export function spellAnswer(s: SpellState, id: string, correct: boolean): SpellState {
  if (s.queue[0] !== id) return s;
  const attempts = { ...s.attempts, [id]: (s.attempts[id] ?? 0) + 1 };
  const rest = s.queue.slice(1);
  if (correct) return { queue: rest, attempts, missed: s.missed, done: [...s.done, id] };
  return { queue: [...rest, id], attempts, missed: s.missed.includes(id) ? s.missed : [...s.missed, id], done: s.done };
}
export const spellFinished = (s: SpellState) => s.queue.length === 0;
