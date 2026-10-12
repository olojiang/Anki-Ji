import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import JSZip from "jszip";
import { exportApkg, markdownToAnkiHtml, sha1Hex, fieldChecksum } from "@/core/io/apkg-export";
import { exporterFromDefinition, type ModelDefinition } from "@/core/interop/models";
import { parseImportFile } from "@/core/io/registry";
import { createBackup, type Backup } from "@/core/io/backup";

let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });

const NOW = new Date("2026-10-12T06:00:00.000Z");
const IMG = "https://blob.example.com/u1/dog.png";
const SND = "https://blob.example.com/u1/dog.mp3";
const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function fixture(): Backup {
  const created = "2026-09-01T00:00:00.000Z";
  const card = (id: number, noteId: number, deckId: number, ord: number, extra: Record<string, unknown> = {}) => ({
    id, noteId, deckId, homeDeckId: null, ord, state: "new", due: new Date(0).toISOString(), stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
    reps: 0, lapses: 0, step: 0, lastReview: null, ease: 0, box: 0, suspended: false, buriedDay: null, flag: 0, leech: false, position: id, createdAt: created, ...extra,
  });
  const note = (id: number, deckId: number, type: string, fields: Record<string, unknown>, tags: string[] = []) => ({ id, deckId, guid: `g${id}`, type, fields, tags, position: id, createdAt: created, updatedAt: created });
  return createBackup({
    exportedAt: NOW.toISOString(),
    settings: { timezone: "Asia/Shanghai", rolloverHour: 4 },
    tags: ["vocab"],
    decks: [
      { id: 1, parentId: null, name: "Lang", position: 1, config: { algorithm: "fsrs", newPerDay: 15, desiredRetention: 0.85 }, filtered: false, filter: null, createdAt: created },
      { id: 2, parentId: 1, name: "日本語", position: 2, config: {}, filtered: false, filter: null, createdAt: created },
      { id: 3, parentId: null, name: "Other", position: 3, config: {}, filtered: false, filter: null, createdAt: created },
      { id: 4, parentId: null, name: "Cram", position: 4, config: {}, filtered: true, filter: { query: "is:due", limit: 10, order: "due" }, createdAt: created },
    ],
    notes: [
      note(10, 2, "basic", { front: "犬", back: `dog ![audio](${SND})\n\n![](${IMG})` }, ["vocab", "jp::n5"]),
      note(11, 2, "basic_reverse", { front: "front", back: "back" }),
      note(12, 1, "cloze", { text: "{{c1::東京}}は{{c2::首都}}", extra: "**capital**" }),
      note(13, 1, "type_in", { front: "2+2", back: "4" }),
      note(14, 1, "basic_optional_reverse", { front: "opt", back: "rev", addReverse: true }),
      note(15, 3, "mcq", { question: "Pick", options: ["a", "b", "c"], correct: [1], explanation: "because" }),
      note(16, 3, "image_occlusion", { image: DATA_URL, header: "Map", extra: "", masks: [{ x: 1, y: 2, w: 3, h: 4, label: "x" }, { x: 10, y: 20, w: 5, h: 5 }], occlusionMode: "hideOne" }),
      note(17, 3, "basic", { front: "math $x^2$", back: "plain" }),
    ],
    cards: [
      card(100, 10, 2, 0, { state: "review", due: "2026-10-20T01:00:00.000Z", stability: 12.5, difficulty: 6.25, scheduledDays: 10, reps: 4, lapses: 1, lastReview: "2026-10-10T01:00:00.000Z", ease: 2.3, flag: 2 }),
      card(101, 11, 2, 0), card(102, 11, 2, 1, { suspended: true }),
      card(103, 12, 1, 1, { state: "learning", due: "2026-10-12T06:10:00.000Z", step: 1, reps: 1, lastReview: "2026-10-12T06:00:00.000Z", stability: 0.4, difficulty: 5 }),
      card(104, 12, 4, 2, { homeDeckId: 1, state: "review", due: "2026-10-11T00:00:00.000Z", stability: 3, difficulty: 4, scheduledDays: 3, reps: 2, lastReview: "2026-10-08T00:00:00.000Z" }),
      card(105, 13, 1, 0), card(106, 14, 1, 0), card(107, 14, 1, 1),
      card(108, 15, 3, 0), card(109, 16, 3, 0), card(110, 16, 3, 1), card(111, 17, 3, 0),
    ],
    revlog: [
      { id: 1, cardId: 100, deckId: 2, rating: 3, state: "new", due: "2026-10-01T00:00:00.000Z", stability: 1, difficulty: 6, elapsedDays: 0, scheduledDays: 1, durationMs: 4000, reviewedAt: "2026-09-30T01:00:00.000Z", algorithm: "fsrs" },
      { id: 2, cardId: 100, deckId: 2, rating: 1, state: "review", due: "2026-10-10T00:10:00.000Z", stability: 1, difficulty: 7, elapsedDays: 2, scheduledDays: 0, durationMs: 9000, reviewedAt: "2026-10-03T01:00:00.000Z", algorithm: "fsrs" },
      { id: 3, cardId: 100, deckId: 2, rating: 3, state: "relearning", due: "2026-10-20T01:00:00.000Z", stability: 12.5, difficulty: 6.25, elapsedDays: 0, scheduledDays: 10, durationMs: 3000, reviewedAt: "2026-10-10T01:00:00.000Z", algorithm: "fsrs" },
    ],
    media: [
      { id: 1, url: IMG, filename: "dog.png", contentType: "image/png", size: 3 },
      { id: 2, url: SND, filename: "dog.mp3", contentType: "audio/mpeg", size: 2 },
      { id: 3, url: "https://blob.example.com/u1/unused.png", filename: "unused.png", contentType: "image/png", size: 1 },
    ],
  });
}
const MEDIA = [
  { url: IMG, filename: "dog.png", bytes: new Uint8Array([1, 2, 3]) },
  { url: SND, filename: "dog.mp3", bytes: new Uint8Array([4, 5]) },
  { url: "https://blob.example.com/u1/unused.png", filename: "unused.png", bytes: new Uint8Array([9]) },
];

async function openCollection(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const db = new SQL.Database(await zip.file("collection.anki2")!.async("uint8array"));
  const media = JSON.parse(await zip.file("media")!.async("string")) as Record<string, string>;
  return { zip, db, media };
}
const rows = (db: Database, sql: string) => { const r = db.exec(sql); return r.length ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };

describe("markdown → Anki HTML", () => {
  it("keeps plain text, renders markdown, converts math to MathJax and audio to [sound:]", () => {
    const ctx = { media: (u: string) => (u === SND ? "dog.mp3" : u === IMG ? "dog.png" : u) };
    expect(markdownToAnkiHtml("dog", ctx)).toBe("dog");
    expect(markdownToAnkiHtml("a < b\nc", ctx)).toBe("a &lt; b<br>c");
    expect(markdownToAnkiHtml("**bold**", ctx)).toBe("<strong>bold</strong>");
    expect(markdownToAnkiHtml("x $a^2$ y", ctx)).toContain("\\(a^2\\)");
    expect(markdownToAnkiHtml(`hi ![audio](${SND})`, ctx)).toBe("hi [sound:dog.mp3]");
    expect(markdownToAnkiHtml(`![](${IMG})`, ctx)).toContain('<img src="dog.png"');
    expect(markdownToAnkiHtml("<b>html</b> kept", ctx)).toBe("<b>html</b> kept");
    expect(markdownToAnkiHtml("{{c1::東京::capital}}", ctx)).toBe("{{c1::東京::capital}}");
  });
  it("computes sha1 / Anki field checksum", () => {
    expect(sha1Hex(new TextEncoder().encode("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(fieldChecksum("abc")).toBe(parseInt("a9993e36", 16));
  });
});

describe(".apkg export", () => {
  it("writes a valid legacy (schema 11) Anki collection", async () => {
    const { bytes, stats } = await exportApkg({ backup: fixture(), includeScheduling: true, media: MEDIA, SQL, now: NOW });
    const { zip, db, media } = await openCollection(bytes);
    expect(Object.values(media).sort()).toEqual(["dog.mp3", "dog.png", expect.stringMatching(/^ak-[0-9a-f]{12}\.png$/)].sort());
    for (const idx of Object.keys(media)) expect(zip.file(idx)).toBeTruthy();
    const col = rows(db, "SELECT * FROM col")[0] as Record<string, string | number>;
    expect(col.ver).toBe(11);
    const models = JSON.parse(String(col.models));
    const names = Object.values(models).map((m) => (m as { name: string }).name).sort();
    expect(names).toEqual(["Basic", "Basic (and reversed card)", "Basic (optional reversed card)", "Basic (type in the answer)", "Cloze"].map((x) => `${x} (Anki-ji)`).sort());
    for (const [k, m] of Object.entries(models) as [string, Record<string, unknown>][]) {
      expect(String(m.id)).toBe(k);
      expect(m).toHaveProperty("css"); expect(m).toHaveProperty("req"); expect(m).toHaveProperty("latexPre");
      expect((m.tmpls as unknown[]).length).toBeGreaterThan(0);
    }
    const decks = JSON.parse(String(col.decks)) as Record<string, { name: string; id: number; conf: number; dyn: number }>;
    expect(Object.values(decks).map((d) => d.name).sort()).toEqual(["Default", "Lang", "Lang::日本語", "Other"]);
    const dconf = JSON.parse(String(col.dconf));
    const lang = Object.values(decks).find((d) => d.name === "Lang")!;
    expect(dconf[String(lang.conf)].new.perDay).toBe(15);
    expect(dconf[String(lang.conf)].desiredRetention).toBe(0.85);
    // every card references an existing note and deck; every note an existing model
    const nids = new Set(rows(db, "SELECT id FROM notes").map((r) => r.id));
    for (const c of rows(db, "SELECT nid, did FROM cards")) { expect(nids.has(c.nid)).toBe(true); expect(decks[String(c.did)]).toBeTruthy(); }
    for (const n of rows(db, "SELECT mid, flds, csum, sfld FROM notes")) {
      expect(models[String(n.mid)]).toBeTruthy();
      expect(String(n.flds).split("\x1f").length).toBe(models[String(n.mid)].flds.length);
      expect(Number(n.csum)).toBeGreaterThan(0);
    }
    expect(stats).toMatchObject({ notes: 9, cards: 12, media: 3, revlog: 3 });
    expect(rows(db, "SELECT count(*) AS n FROM revlog")[0].n).toBe(3);
    if (process.env.APKG_OUT) (await import("node:fs")).writeFileSync(process.env.APKG_OUT, bytes);
    const integrity = rows(db, "PRAGMA integrity_check")[0];
    expect(Object.values(integrity)[0]).toBe("ok");
  });

  it("round-trips notes, cards, media and scheduling through the .apkg importer", async () => {
    const { bytes } = await exportApkg({ backup: fixture(), includeScheduling: true, media: MEDIA, SQL, now: NOW });
    const p = await parseImportFile("x.apkg", bytes, { defaultDeck: "Default", loadSqlJs: async () => SQL });
    const b = p.backup;
    const byGuid = Object.fromEntries(b.notes.map((n) => [n.guid, n]));
    expect(byGuid.g10.type).toBe("basic");
    expect(byGuid.g10.fields.front).toBe("犬");
    expect(byGuid.g10.fields.back).toContain("![audio](anki-media:dog.mp3)");
    expect(byGuid.g10.fields.back).toContain('src="anki-media:dog.png"');
    expect(byGuid.g10.tags.sort()).toEqual(["jp::n5", "vocab"]);
    expect(byGuid.g11.type).toBe("basic_reverse");
    expect(byGuid.g12).toMatchObject({ type: "cloze", fields: { text: "{{c1::東京}}は{{c2::首都}}", extra: "<strong>capital</strong>" } });
    expect(byGuid.g13).toMatchObject({ type: "type_in", fields: { front: "2+2", back: "4" } });
    expect(byGuid.g14).toMatchObject({ type: "basic_optional_reverse", fields: { front: "opt", back: "rev", addReverse: true } });
    expect(byGuid.g15.type).toBe("basic");
    expect(byGuid.g15.fields.front).toContain("Pick");
    expect(byGuid.g15.fields.back).toContain("b");
    // image occlusion: one Anki note per mask, image shipped as media
    expect(byGuid["g16#io0"].fields.front).toMatch(/src="anki-media:ak-[0-9a-f]{12}\.png"/);
    expect(byGuid["g16#io1"]).toBeTruthy();
    // decks: filtered deck card went home
    const path = (id: number): string => { const d = b.decks.find((x) => x.id === id)!; return d.parentId ? `${path(d.parentId)}::${d.name}` : d.name; };
    expect(path(byGuid.g10.deckId)).toBe("Lang::日本語");
    const cardsOf = (g: string) => b.cards.filter((c) => c.noteId === byGuid[g].id).sort((x, y) => x.ord - y.ord);
    expect(cardsOf("g12").map((c) => [c.ord, path(c.deckId)])).toEqual([[1, "Lang"], [2, "Lang"]]);
    expect(cardsOf("g11").map((c) => c.ord)).toEqual([0, 1]);
    expect(cardsOf("g14").map((c) => c.ord)).toEqual([0, 1]);
    // scheduling
    const rev = cardsOf("g10")[0];
    expect(rev.state).toBe("review");
    expect(rev.scheduledDays).toBe(10);
    expect(Math.abs(Date.parse(rev.due) - Date.parse("2026-10-20T01:00:00.000Z"))).toBeLessThan(86400000);
    expect(rev).toMatchObject({ reps: 4, lapses: 1, stability: 12.5, difficulty: 6.25, flag: 2 });
    expect(cardsOf("g11")[1].suspended).toBe(true);
    const lrn = cardsOf("g12")[0];
    expect(lrn.state).toBe("learning");
    expect(Date.parse(lrn.due)).toBe(Date.parse("2026-10-12T06:10:00.000Z"));
    expect(lrn.stability).toBeCloseTo(0.4);
    expect(cardsOf("g13")[0].state).toBe("new");
    // revlog
    const rl = b.revlog.filter((r) => r.cardId === rev.id).sort((x, y) => x.reviewedAt.localeCompare(y.reviewedAt));
    expect(rl.map((r) => [r.rating, r.state, r.durationMs])).toEqual([[3, "new", 4000], [1, "review", 9000], [3, "relearning", 3000]]);
    expect(rl[0].reviewedAt).toBe("2026-09-30T01:00:00.000Z");
    expect(rl[2].scheduledDays).toBe(10);
    // media
    expect(b.media.map((m) => m.filename).sort()).toEqual(["dog.mp3", "dog.png", expect.stringMatching(/^ak-/)].sort());
    expect(b.media.find((m) => m.filename === "dog.png")!.data).toBe("AQID");
  });

  it("exports a deck subtree only, and can drop scheduling", async () => {
    const { bytes, stats } = await exportApkg({ backup: fixture(), deckId: 1, includeScheduling: false, media: MEDIA, SQL, now: NOW });
    const { db, media } = await openCollection(bytes);
    expect(stats.notes).toBe(5);
    expect(Object.values(media).sort()).toEqual(["dog.mp3", "dog.png"]);
    const decks = JSON.parse(String(rows(db, "SELECT decks FROM col")[0].decks));
    expect(Object.values(decks).map((d) => (d as { name: string }).name).sort()).toEqual(["Default", "Lang", "Lang::日本語"]);
    for (const c of rows(db, "SELECT type, queue, ivl, reps, data FROM cards")) expect(c).toMatchObject({ type: 0, queue: 0, ivl: 0, reps: 0 });
    expect(rows(db, "SELECT count(*) AS n FROM revlog")[0].n).toBe(0);
    const p = await parseImportFile("x.apkg", bytes, { defaultDeck: "Default", loadSqlJs: async () => SQL });
    expect(p.backup.cards.every((c) => c.state === "new")).toBe(true);
  });

  it("keeps remote URLs when media bytes are unavailable", async () => {
    const { bytes, stats } = await exportApkg({ backup: fixture(), deckId: 2, includeScheduling: true, media: [], SQL, now: NOW });
    const { db } = await openCollection(bytes);
    expect(stats.media).toBe(0);
    expect(String(rows(db, "SELECT flds FROM notes")[0].flds)).toContain(IMG);
  });

  it("plugs in custom note types via a model definition", async () => {
    const model: ModelDefinition = { id: 99, name: "Vocab", kind: "standard", fields: ["Word", "Meaning"], css: ".card{}", templates: [{ name: "Recognise", qfmt: "{{Word}}", afmt: "{{Meaning}}" }, { name: "Recall", qfmt: "{{Meaning}}", afmt: "{{Word}}" }] };
    const b = fixture();
    b.notes = [{ ...b.notes[0], type: "vocab" as never, fields: { Word: "猫", Meaning: "cat" } as never }];
    b.cards = [{ ...b.cards[0], ord: 0 }, { ...b.cards[0], id: 999, ord: 1 }];
    b.revlog = [];
    const { bytes } = await exportApkg({ backup: b, includeScheduling: true, media: [], SQL, now: NOW, exporters: { vocab: exporterFromDefinition(model) } });
    const { db } = await openCollection(bytes);
    const models = JSON.parse(String(rows(db, "SELECT models FROM col")[0].models));
    expect(models["99"].name).toBe("Vocab");
    expect(models["99"].tmpls.map((t: { name: string }) => t.name)).toEqual(["Recognise", "Recall"]);
    expect(rows(db, "SELECT flds FROM notes")[0].flds).toBe("猫\x1fcat");
    expect(rows(db, "SELECT ord FROM cards ORDER BY ord").map((r) => r.ord)).toEqual([0, 1]);
  });
});
