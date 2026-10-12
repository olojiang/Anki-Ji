import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import JSZip from "jszip";
import { readApkg, apkgToBackup, type AnkiModel } from "@/core/io/apkg";
import { isStockAnkiModel, ankiModelToNoteType, readProto, convertAnkiFieldHtml } from "@/core/io/apkg-notetypes";
import { generateOrdinals, renderNoteTypeCard, validateNoteType } from "@/core/notetypes";

const LEGACY_SCHEMA = `CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
  CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
  CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`;

const card = (id: number, nid: number, ord: number, review = false) =>
  `INSERT INTO cards VALUES (${id},${nid},1,${ord},0,0,${review ? 2 : 0},${review ? 2 : 0},${review ? 100 : 0},${review ? 7 : 0},2500,${review ? 3 : 0},0,0,0,0,0,'')`;

async function legacyApkg() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(LEGACY_SCHEMA);
  const models = {
    "1600000000001": {
      id: 1600000000001, name: "Vocab JP", type: 0, sortf: 1, css: ".card { font-family: serif; color: black; background-color: white; }\n.reading { color: #c00; }",
      flds: [{ name: "Word", ord: 0, font: "Noto Serif JP", size: 28 }, { name: "Meaning", ord: 1, rtl: false }, { name: "Reading", ord: 2 }],
      tmpls: [
        { name: "Recognition", ord: 0, qfmt: "<div class=word>{{Word}}</div>", afmt: "{{FrontSide}}<hr id=answer>{{Meaning}}{{#Reading}}<div class=reading>{{furigana:Reading}}</div>{{/Reading}}" },
        { name: "Production", ord: 1, qfmt: "{{Meaning}}", afmt: "{{FrontSide}}<hr id=answer>{{Word}}" },
      ],
    },
    "1600000000002": {
      id: 1600000000002, name: "Cloze+", type: 1, css: ".cloze{color:blue}",
      flds: [{ name: "Text", ord: 0 }, { name: "Notes", ord: 1 }, { name: "Source", ord: 2 }],
      tmpls: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}<div class=src>{{Source}}</div>", afmt: "{{cloze:Text}}<br>{{Notes}}" }],
    },
    "1600000000003": {
      id: 1600000000003, name: "基础", type: 0, css: ".card{}",
      flds: [{ name: "正面", ord: 0 }, { name: "背面", ord: 1 }],
      tmpls: [{ name: "卡片 1", ord: 0, qfmt: "{{正面}}", afmt: "{{FrontSide}}<hr id=answer>{{背面}}" }],
    },
  };
  db.run("INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')", [JSON.stringify(models), JSON.stringify({ "1": { id: 1, name: "Default" } })]);
  db.run("INSERT INTO notes VALUES (10,'v1',1600000000001,0,0,'jp',?,0,0,0,'')", ["犬\x1fdog [sound:inu.mp3]\x1f犬[いぬ]"]);
  db.run("INSERT INTO notes VALUES (11,'c1',1600000000002,0,0,'',?,0,0,0,'')", ["{{c1::Paris}} and {{c2::Rome}}\x1fnote\x1fatlas"]);
  db.run("INSERT INTO notes VALUES (12,'z1',1600000000003,0,0,'',?,0,0,0,'')", ["前\x1f后"]);
  db.run(card(100, 10, 0, true)); db.run(card(101, 10, 1));
  db.run(card(110, 11, 0)); db.run(card(111, 11, 1, true));
  db.run(card(120, 12, 0));
  const zip = new JSZip();
  zip.file("collection.anki2", db.export());
  zip.file("media", JSON.stringify({ "0": "inu.mp3" }));
  zip.file("0", new Uint8Array([9, 9]));
  return { SQL, bytes: await zip.generateAsync({ type: "uint8array" }) };
}

// ── minimal protobuf writer for schema-18 configs ──
const varint = (n: number) => { const out: number[] = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); return out; };
const pbStr = (field: number, s: string) => { const b = [...new TextEncoder().encode(s)]; return [...varint((field << 3) | 2), ...varint(b.length), ...b]; };
const pbInt = (field: number, n: number) => [...varint(field << 3), ...varint(n)];

async function schema18Apkg() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob);
    CREATE TABLE fields (ntid integer, ord integer, name text, config blob);
    CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob);
    CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`);
  db.run("INSERT INTO col VALUES (1,0,0,0,18,0,0,0,'','','','','')");
  db.run("INSERT INTO notetypes VALUES (77, 'Def', 0, 0, ?)", [new Uint8Array([...pbInt(1, 0), ...pbInt(2, 1), ...pbStr(3, ".card{font-size:30px}")])]);
  db.run("INSERT INTO fields VALUES (77, 0, 'Term', ?)", [new Uint8Array([...pbStr(3, "Arial"), ...pbInt(4, 24)])]);
  db.run("INSERT INTO fields VALUES (77, 1, 'Definition', ?)", [new Uint8Array([...pbInt(2, 1)])]);
  db.run("INSERT INTO fields VALUES (77, 2, 'Example', ?)", [new Uint8Array([])]);
  db.run("INSERT INTO templates VALUES (77, 0, 'Forward', 0, 0, ?)", [new Uint8Array([...pbStr(1, "{{Term}}"), ...pbStr(2, "{{FrontSide}}<hr id=answer>{{Definition}}<i>{{Example}}</i>")])]);
  db.run("INSERT INTO decks VALUES (1, 'Default', 0, 0, x'', x'')");
  db.run("INSERT INTO notes VALUES (5,'d1',77,0,0,'',?,0,0,0,'')", ["word\x1fmeaning\x1fexample"]);
  db.run(card(50, 5, 0));
  const zip = new JSZip();
  zip.file("collection.anki21", db.export());
  return { SQL, bytes: await zip.generateAsync({ type: "uint8array" }) };
}

describe("Anki model → note type", () => {
  const m = (over: Partial<AnkiModel>): AnkiModel => ({ id: 1, name: "M", type: 0, fieldNames: ["Front", "Back"], templateCount: 1, templates: [{ name: "Card 1", qfmt: "{{Front}}", afmt: "{{FrontSide}}<hr id=answer>{{Back}}" }], ...over });
  it("recognises stock-shaped models (any field names / language) and keeps them on the built-in path", () => {
    expect(isStockAnkiModel(m({}))).toBe(true);
    expect(isStockAnkiModel(m({ fieldNames: ["正面", "背面"], templates: [{ name: "1", qfmt: "{{正面}}", afmt: "" }] }))).toBe(true);
    expect(isStockAnkiModel(m({ templateCount: 2, templates: [{ name: "1", qfmt: "{{Front}}", afmt: "" }, { name: "2", qfmt: "{{Back}}", afmt: "" }] }))).toBe(true);
    expect(isStockAnkiModel(m({ templates: [{ name: "1", qfmt: "{{Front}}\n<br>\n{{type:Back}}", afmt: "" }] }))).toBe(true);
    expect(isStockAnkiModel(m({ type: 1, fieldNames: ["Text", "Back Extra"], templates: [{ name: "c", qfmt: "{{cloze:Text}}", afmt: "" }] }))).toBe(true);
    expect(isStockAnkiModel(m({ templates: undefined }))).toBe(true); // nothing to rebuild a template from
  });
  it("treats extra fields or real template markup as custom", () => {
    expect(isStockAnkiModel(m({ fieldNames: ["A", "B", "C"], templates: [{ name: "1", qfmt: "{{A}}", afmt: "" }] }))).toBe(false);
    expect(isStockAnkiModel(m({ templates: [{ name: "1", qfmt: "<div class=big>{{Front}}</div>", afmt: "" }] }))).toBe(false);
    expect(isStockAnkiModel(m({ type: 1, fieldNames: ["Text", "Back Extra"], templates: [{ name: "c", qfmt: "{{cloze:Text}}{{Back Extra}}", afmt: "" }] }))).toBe(false);
  });
  it("converts a model with deterministic field ids and template ords = Anki ords", () => {
    const nt = ankiModelToNoteType({ id: 42, name: "X", type: 0, fieldNames: ["A", "B"], templateCount: 2, css: ".card{}", sortf: 1,
      fields: [{ name: "A", font: "Serif", size: 30, rtl: true }, { name: "B" }],
      templates: [{ name: "One", qfmt: "{{A}}", afmt: "{{B}}" }, { name: "Two", qfmt: "{{B}}", afmt: "{{A}}" }] });
    expect(nt).toMatchObject({ id: 42, name: "X", kind: "standard", sortField: 1, markdown: false, sourceKey: "anki:42", css: ".card{}" });
    expect(nt.fields).toEqual([{ id: "f0", name: "A", font: "Serif", size: 30, rtl: true }, { id: "f1", name: "B" }]);
    expect(nt.templates.map((t) => [t.ord, t.name])).toEqual([[0, "One"], [1, "Two"]]);
  });
  it("converts [sound:] to an audio element and points media at placeholders", () => {
    expect(convertAnkiFieldHtml('a [sound:x y.mp3] <img src="p.png">')).toBe('a <audio controls preload="none" src="anki-media:x y.mp3"></audio> <img src="anki-media:p.png">');
  });
  it("decodes protobuf messages", () => {
    const p = readProto(new Uint8Array([...pbInt(1, 1), ...pbStr(3, "css"), ...pbInt(2, 300)]));
    expect(p.get(1)).toEqual([1]);
    expect(p.get(2)).toEqual([300]);
    expect(new TextDecoder().decode(p.get(3)![0] as Uint8Array)).toBe("css");
  });
});

describe(".apkg import with custom note types", () => {
  it("maps custom legacy models to note types, keeps stock-shaped ones on the built-in path", async () => {
    const { SQL, bytes } = await legacyApkg();
    const col = await readApkg(bytes, SQL);
    expect(col.models.get(1600000000001)?.templates?.[0].qfmt).toBe("<div class=word>{{Word}}</div>");
    const b = apkgToBackup(col, { exportedAt: "2026-10-12T00:00:00.000Z" });
    const byGuid = Object.fromEntries(b.notes.map((n) => [n.guid, n]));

    expect(b.noteTypes?.map((t) => t.name).sort()).toEqual(["Cloze+", "Vocab JP"]);
    const vocab = b.noteTypes!.find((t) => t.name === "Vocab JP")!;
    expect(validateNoteType(vocab)).toEqual([]);
    expect(vocab.fields[0]).toMatchObject({ name: "Word", font: "Noto Serif JP", size: 28 });

    const v = byGuid.v1;
    expect(v.type).toBe("custom");
    expect(v.notetypeId).toBe(1600000000001);
    expect(v.fields.custom).toEqual({ f0: "犬", f1: 'dog <audio controls preload="none" src="anki-media:inu.mp3"></audio>', f2: "犬[いぬ]" });
    const vCards = b.cards.filter((c) => c.noteId === v.id);
    expect(vCards.map((c) => c.ord).sort()).toEqual([0, 1]);
    expect(vCards.find((c) => c.ord === 0)?.state).toBe("review");
    const r = renderNoteTypeCard(vocab, v.fields.custom!, 0);
    expect(r.front).toBe("<div class=word>犬</div>");
    expect(r.back).toContain("<ruby><rb>犬</rb><rt>いぬ</rt></ruby>");

    const cz = byGuid.c1;
    expect(cz.type).toBe("custom");
    const czType = b.noteTypes!.find((t) => t.name === "Cloze+")!;
    expect(czType.kind).toBe("cloze");
    expect(generateOrdinals(czType, cz.fields.custom!)).toEqual([1, 2]);
    expect(b.cards.filter((c) => c.noteId === cz.id).map((c) => c.ord).sort()).toEqual([1, 2]); // Anki 0-based → 1-based
    expect(b.cards.find((c) => c.noteId === cz.id && c.ord === 2)?.state).toBe("review");

    expect(byGuid.z1.type).toBe("basic");
    expect(byGuid.z1.fields).toEqual({ front: "前", back: "后" });
  });

  it("reads schema-18 (anki21b-style tables) note types, fields and templates from protobuf configs", async () => {
    const { SQL, bytes } = await schema18Apkg();
    const col = await readApkg(bytes, SQL);
    const model = col.models.get(77)!;
    expect(model.css).toBe(".card{font-size:30px}");
    expect(model.sortf).toBe(1);
    expect(model.fields?.[0]).toMatchObject({ name: "Term", font: "Arial", size: 24 });
    expect(model.fields?.[1].rtl).toBe(true);
    expect(model.templates?.[0]).toEqual({ name: "Forward", qfmt: "{{Term}}", afmt: "{{FrontSide}}<hr id=answer>{{Definition}}<i>{{Example}}</i>" });
    const b = apkgToBackup(col);
    expect(b.notes[0].type).toBe("custom");
    expect(b.noteTypes?.[0]).toMatchObject({ name: "Def", sortField: 1, css: ".card{font-size:30px}" });
  });
});
