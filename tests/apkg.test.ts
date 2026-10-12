import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import JSZip from "jszip";
import { readApkg, apkgToBackup } from "@/core/io/apkg";

async function makeApkg() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
          CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
          CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`);
  const models = {
    "111": { id: 111, name: "Basic", type: 0, flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }], tmpls: [{ name: "Card 1", qfmt: "{{Front}}", afmt: "{{Back}}" }] },
    "222": { id: 222, name: "Cloze", type: 1, flds: [{ name: "Text", ord: 0 }, { name: "Back Extra", ord: 1 }], tmpls: [{ name: "Cloze", qfmt: "{{cloze:Text}}", afmt: "" }] },
    "333": { id: 333, name: "Basic (and reversed card)", type: 0, flds: [{ name: "Front", ord: 0 }, { name: "Back", ord: 1 }], tmpls: [{ name: "Card 1" }, { name: "Card 2" }] },
  };
  const decks = { "1": { id: 1, name: "Default" }, "5": { id: 5, name: "日本語::単語" } };
  db.run("INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}',?,?,'{}','{}')", [JSON.stringify(models), JSON.stringify(decks)]);
  db.run("INSERT INTO notes VALUES (1,'gA',111,0,0,' vocab jp::n5 ',?,0,0,0,'')", ["犬<img src=\"dog.jpg\">\x1fdog [sound:dog.mp3]"]);
  db.run("INSERT INTO notes VALUES (2,'gB',222,0,0,'',?,0,0,0,'')", ["{{c1::東京}}は{{c2::首都}}\x1fextra"]);
  db.run("INSERT INTO notes VALUES (3,'gC',333,0,0,'',?,0,0,0,'')", ["front\x1fback"]);
  db.run("INSERT INTO cards VALUES (1,1,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'')");
  db.run("INSERT INTO cards VALUES (2,2,5,0,0,0,2,2,100,10,2500,5,1,0,0,0,0,'')");
  db.run("INSERT INTO cards VALUES (3,2,5,1,0,0,0,0,0,0,0,0,0,0,0,0,0,'')");
  db.run("INSERT INTO cards VALUES (4,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'')");
  db.run("INSERT INTO cards VALUES (5,3,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,'')");
  const zip = new JSZip();
  zip.file("collection.anki2", db.export());
  zip.file("media", JSON.stringify({ "0": "dog.jpg", "1": "dog.mp3" }));
  zip.file("0", new Uint8Array([1, 2, 3]));
  zip.file("1", new Uint8Array([4, 5]));
  return { SQL, bytes: await zip.generateAsync({ type: "uint8array" }) };
}

describe(".apkg import", () => {
  it("reads a legacy Anki package and converts Basic / Cloze / reversed notes", async () => {
    const { SQL, bytes } = await makeApkg();
    const col = await readApkg(bytes, SQL);
    expect(col.notes).toHaveLength(3);
    expect(col.media.size).toBe(2);
    const b = apkgToBackup(col, { exportedAt: "2026-10-12T00:00:00.000Z" });
    expect(b.format).toBe("anki-ji-backup");
    const byGuid = Object.fromEntries(b.notes.map((n) => [n.guid, n]));
    expect(byGuid.gA.type).toBe("basic");
    expect(byGuid.gA.tags).toEqual(["vocab", "jp::n5"]);
    expect(byGuid.gA.fields.front).toContain('src="anki-media:dog.jpg"');
    expect(byGuid.gA.fields.back).toContain("![audio](anki-media:dog.mp3)");
    expect(byGuid.gB.type).toBe("cloze");
    expect(byGuid.gB.fields).toEqual({ text: "{{c1::東京}}は{{c2::首都}}", extra: "extra" });
    expect(byGuid.gC.type).toBe("basic_reverse");
    const deckNames = b.decks.map((d) => d.name).sort();
    expect(deckNames).toEqual(["Default", "単語", "日本語"].sort());
    const tango = b.decks.find((d) => d.name === "単語")!;
    expect(b.decks.find((d) => d.id === tango.parentId)!.name).toBe("日本語");
    expect(b.notes.find((n) => n.guid === "gB")!.deckId).toBe(tango.id);
    expect(b.cards.filter((c) => c.noteId === byGuid.gB.id).map((c) => c.ord).sort()).toEqual([1, 2]);
    expect(b.media.map((m) => m.filename).sort()).toEqual(["dog.jpg", "dog.mp3"]);
    expect(b.media.find((m) => m.filename === "dog.jpg")!.url).toBe("anki-media:dog.jpg");
  });
  it("rejects files that are not Anki packages", async () => {
    const SQL = await initSqlJs();
    const zip = new JSZip(); zip.file("hello.txt", "x");
    await expect(readApkg(await zip.generateAsync({ type: "uint8array" }), SQL)).rejects.toThrow();
  });
});
