import { describe, it, expect } from "vitest";
import {
  itemsFromNotes, normalizeAnswer, levenshtein, matchAnswer, pickDistractors, generateTest, gradeQuestion, scoreTest,
  generateMatch, matchFinalTime, isBetterTime, MATCH_PENALTY_MS, spellInit, spellAnswer, spellFinished, rng, shuffle, type StudyItem,
} from "@/core/modes";

const mk = (pairs: [string, string][]): StudyItem[] =>
  itemsFromNotes(pairs.map(([front, back], i) => ({ id: i + 1, type: "basic" as const, fields: { front, back } })));

const vocab = mk([
  ["dog", "犬"], ["cat", "猫"], ["bird", "鸟"], ["fish", "鱼"], ["horse", "马"], ["cow", "牛"], ["sheep", "羊"], ["pig", "猪"],
]);

describe("study items from notes", () => {
  it("builds forward items for basic-like types and skips image occlusion", () => {
    const items = itemsFromNotes([
      { id: 1, type: "basic", fields: { front: "**Hello**", back: "你好" } },
      { id: 2, type: "basic_reverse", fields: { front: "a", back: "b" } },
      { id: 3, type: "type_in", fields: { front: "capital of France", back: "Paris" } },
      { id: 4, type: "image_occlusion", fields: { image: "x", masks: [{ x: 1, y: 1, w: 1, h: 1 }] } },
      { id: 5, type: "basic", fields: { front: "empty back", back: "" } },
    ]);
    expect(items.map((i) => i.id)).toEqual(["1:0", "2:0", "3:0"]);
    expect(items[0]).toMatchObject({ noteId: 1, prompt: "**Hello**", promptText: "Hello", answer: "你好", answerText: "你好" });
  });
  it("reverse direction swaps prompt and answer", () => {
    const items = itemsFromNotes([{ id: 1, type: "basic", fields: { front: "a", back: "b" } }], { direction: "reverse" });
    expect(items[0]).toMatchObject({ promptText: "b", answerText: "a" });
    const both = itemsFromNotes([{ id: 1, type: "basic", fields: { front: "a", back: "b" } }], { direction: "both" });
    expect(both.map((i) => i.id)).toEqual(["1:0", "1:r"]);
  });
  it("makes one item per cloze ordinal with the deleted text as answer", () => {
    const items = itemsFromNotes([{ id: 7, type: "cloze", fields: { text: "{{c1::Paris}} is the capital of {{c2::France::country}}" } }]);
    expect(items).toHaveLength(2);
    expect(items[0].answerText).toBe("Paris");
    expect(items[0].promptText).toContain("capital of France");
    expect(items[0].promptText).not.toContain("Paris");
    expect(items[1].answerText).toBe("France");
  });
  it("mcq uses the correct options as answer", () => {
    const items = itemsFromNotes([{ id: 9, type: "mcq", fields: { question: "2+2?", options: ["3", "4", "5"], correct: [1] } }]);
    expect(items[0]).toMatchObject({ promptText: "2+2?", answerText: "4" });
  });
});

describe("fuzzy answer matching", () => {
  it("normalizes case, whitespace, markup and punctuation", () => {
    expect(normalizeAnswer("  <b>Hello</b>,   World! ")).toBe("hello world");
    expect(normalizeAnswer("Ｈｅｌｌｏ")).toBe("hello");
  });
  it("levenshtein distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("猫", "猫")).toBe(0);
  });
  it("exact / close / wrong verdicts", () => {
    expect(matchAnswer("paris", "Paris")).toMatchObject({ verdict: "exact", correct: true });
    expect(matchAnswer("Pariss", "Paris")).toMatchObject({ verdict: "close", correct: true });
    expect(matchAnswer("London", "Paris")).toMatchObject({ verdict: "wrong", correct: false });
    // short answers get no typo tolerance
    expect(matchAnswer("cot", "cat").verdict).toBe("wrong");
    expect(matchAnswer("狗", "猫").verdict).toBe("wrong");
    // longer answers tolerate a couple of typos
    expect(matchAnswer("photosythesis", "photosynthesis").verdict).toBe("close");
  });
  it("accepts any of several alternatives separated by semicolons", () => {
    expect(matchAnswer("dog", "hound; dog").verdict).toBe("exact");
    expect(matchAnswer("", "dog").verdict).toBe("wrong");
  });
  it("returns a character diff against the expected answer (reuses typed.ts)", () => {
    const r = matchAnswer("Pariss", "Paris");
    expect(r.segments.some((s) => s.kind === "wrong")).toBe(true);
    expect(r.segments.filter((s) => s.kind !== "wrong").map((s) => s.text).join("")).toBe("Paris");
  });
});

describe("distractors", () => {
  it("draws distinct wrong answers from other items in the set", () => {
    const target = vocab[0];
    const d = pickDistractors(vocab, target, 3, rng(1));
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    expect(d).not.toContain(target.answer);
    for (const x of d) expect(vocab.some((i) => i.answer === x)).toBe(true);
  });
  it("never uses an answer equal (after normalization) to the right one", () => {
    const items = mk([["a", "Same"], ["b", " same "], ["c", "Other"]]);
    expect(pickDistractors(items, items[0], 3, rng(2))).toEqual(["Other"]);
  });
  it("prefers answers that look alike (script / length)", () => {
    const items = mk([["q", "苹果"], ["r", "香蕉"], ["s", "a very long english sentence about nothing"], ["t", "葡萄"], ["u", "another long english phrase here"]]);
    for (let seed = 1; seed < 6; seed++) {
      const d = pickDistractors(items, items[0], 2, rng(seed));
      expect(d.sort()).toEqual(["葡萄", "香蕉"].sort());
    }
  });
});

describe("test generation and scoring", () => {
  it("generates the requested number of mixed questions", () => {
    const qs = generateTest(vocab, { count: 6, seed: 3 });
    expect(qs).toHaveLength(6);
    const kinds = new Set(qs.map((q) => q.kind));
    expect(kinds).toEqual(new Set(["mc", "tf", "written"]));
    for (const q of qs) {
      if (q.kind === "mc") {
        expect(q.options!.length).toBe(4);
        expect(q.options![q.correctIndex!]).toBe(q.answer);
      }
      if (q.kind === "tf") expect(typeof q.statementTrue).toBe("boolean");
    }
    expect(new Set(qs.map((q) => q.itemId)).size).toBe(6);
  });
  it("is deterministic for a seed", () => {
    expect(generateTest(vocab, { count: 5, seed: 9 })).toEqual(generateTest(vocab, { count: 5, seed: 9 }));
  });
  it("falls back to written when there are no distractors", () => {
    const one = mk([["only", "one"]]);
    const qs = generateTest(one, { kinds: ["mc"], seed: 1 });
    expect(qs[0].kind).toBe("written");
    const tf = generateTest(one, { kinds: ["tf"], seed: 1 });
    expect(tf[0]).toMatchObject({ kind: "tf", statementTrue: true });
  });
  it("respects selected kinds and caps count at item count", () => {
    const qs = generateTest(vocab, { count: 50, kinds: ["written"], seed: 4 });
    expect(qs).toHaveLength(vocab.length);
    expect(qs.every((q) => q.kind === "written")).toBe(true);
  });
  it("grades every kind and summarizes mistakes", () => {
    const qs = generateTest(vocab, { count: 6, seed: 5 });
    const responses = qs.map((q, i) => {
      const right = i % 2 === 0;
      if (q.kind === "mc") return { choice: right ? q.correctIndex! : (q.correctIndex! + 1) % q.options!.length };
      if (q.kind === "tf") return { value: right ? q.statementTrue! : !q.statementTrue };
      return { text: right ? q.answerText : "zzz" };
    });
    for (let i = 0; i < qs.length; i++) expect(gradeQuestion(qs[i], responses[i]).correct).toBe(i % 2 === 0);
    const s = scoreTest(qs, responses);
    expect(s).toMatchObject({ correct: 3, total: 6, percent: 50 });
    expect(s.mistakes.map((m) => m.index)).toEqual([1, 3, 5]);
    const sumKinds = Object.values(s.byKind).reduce((a, k) => a + k.total, 0);
    expect(sumKinds).toBe(6);
  });
  it("unanswered questions count as mistakes", () => {
    const qs = generateTest(vocab, { count: 2, seed: 1 });
    const s = scoreTest(qs, [null, null]);
    expect(s.correct).toBe(0);
    expect(s.mistakes).toHaveLength(2);
  });
});

describe("match game", () => {
  it("creates shuffled prompt/answer tile pairs with unique texts", () => {
    const tiles = generateMatch(vocab, 6, rng(1));
    expect(tiles).toHaveLength(12);
    const byPair = new Map<string, string[]>();
    for (const t of tiles) byPair.set(t.pairId, [...(byPair.get(t.pairId) ?? []), t.side]);
    expect(byPair.size).toBe(6);
    for (const sides of byPair.values()) expect(sides.sort()).toEqual(["answer", "prompt"]);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(12);
  });
  it("skips ambiguous items (duplicate texts)", () => {
    const items = mk([["a", "x"], ["b", "x"], ["c", "y"]]);
    const tiles = generateMatch(items, 6, rng(1));
    expect(tiles).toHaveLength(4);
  });
  it("adds a penalty per miss and compares best times", () => {
    expect(matchFinalTime(12000, 2)).toBe(12000 + 2 * MATCH_PENALTY_MS);
    expect(isBetterTime(null, 5000)).toBe(true);
    expect(isBetterTime(4000, 5000)).toBe(false);
    expect(isBetterTime(6000, 5000)).toBe(true);
  });
});

describe("spell mode", () => {
  it("re-queues missed items until all are answered correctly", () => {
    let s = spellInit(["a", "b", "c"]);
    expect(s.queue[0]).toBe("a");
    s = spellAnswer(s, "a", true);
    s = spellAnswer(s, "b", false);
    expect(s.queue).toEqual(["c", "b"]);
    s = spellAnswer(s, "c", true);
    expect(spellFinished(s)).toBe(false);
    s = spellAnswer(s, "b", false);
    s = spellAnswer(s, "b", true);
    expect(spellFinished(s)).toBe(true);
    expect(s.missed).toEqual(["b"]);
    expect(s.attempts).toEqual({ a: 1, b: 3, c: 1 });
    expect(s.done).toEqual(["a", "c", "b"]);
  });
  it("ignores answers for items that are not current", () => {
    const s = spellInit(["a", "b"]);
    expect(spellAnswer(s, "b", true)).toEqual(s);
  });
});

describe("rng helpers", () => {
  it("seeded rng and shuffle are deterministic and keep elements", () => {
    const a = shuffle([1, 2, 3, 4, 5], rng(42));
    expect(a).toEqual(shuffle([1, 2, 3, 4, 5], rng(42)));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
