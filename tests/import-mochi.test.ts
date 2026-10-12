import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseEdn } from "@/core/io/edn";
import { decodeTransit } from "@/core/io/transit";
import { parseMochi } from "@/core/io/mochi";
import { draftToBackup, mediaRef } from "@/core/io/draft";

const edn = readFileSync(new URL("./fixtures/import/mochi-data.edn", import.meta.url), "utf8");

describe("EDN reader", () => {
  it("reads maps, vectors, lists, sets, keywords, strings, numbers, nil/bool, tags, comments and #_ discards", () => {
    expect(parseEdn('{:a 1, :b [1 2.5 -3] :c (x "s\\"q\\n") :d #{"t"} :e nil :f true :g #inst "2020-01-01" ; c\n :h #_ 9 10 :ns/k \\a}')).toEqual({
      a: 1, b: [1, 2.5, -3], c: ["x", 's"q\n'], d: ["t"], e: null, f: true, g: "2020-01-01", h: 10, "ns/k": "a",
    });
  });
});

describe("Transit JSON decoder", () => {
  it("decodes keywords, ~#list / ~#set tags, array maps and the ^N key cache", () => {
    const json = ["^ ", "~:version", 2, "~:decks", [["^ ", "~:id", "~:abcd1234", "~:name", "Geo", "~:cards", ["~#list", [["^ ", "~:content", "Q\n---\nA", "~:tags", ["~#set", ["t"]]]]]], ["^ ", "^2", "^3", "^4", "Sub", "~:parent-id", "^3"]]];
    expect(decodeTransit(json)).toEqual({ version: 2, decks: [{ id: "abcd1234", name: "Geo", cards: [{ content: "Q\n---\nA", tags: ["t"] }] }, { id: "abcd1234", name: "Sub", "parent-id": "abcd1234" }] });
  });
  it("handles verbose maps, escaped strings and dates", () => {
    expect(decodeTransit({ "~:a": "~~x", "~:b": "~m1700000000000", "~:c": { "~#dt": 5 } })).toEqual({ a: "~x", b: "2023-11-14T22:13:20.000Z", c: "1970-01-01T00:00:00.005Z" });
  });
});

async function mochiZip(data: { name: string; text: string }) {
  const z = new JSZip();
  z.file(data.name, data.text);
  z.file("dog.jpg", new Uint8Array([1, 2, 3]));
  z.file("unused.png", new Uint8Array([4]));
  return z.generateAsync({ type: "uint8array" });
}

describe(".mochi export", () => {
  it("reads data.edn: nested decks, --- sides, clozes, templates, tags, attachments; skips trashed", async () => {
    const d = await parseMochi(await mochiZip({ name: "data.edn", text: edn }));
    expect(d.format).toBe("mochi");
    expect(d.notes.map((n) => [n.deckPath, n.type, n.fields.front ?? n.fields.text, n.fields.back ?? n.fields.extra, n.tags, n.guid])).toEqual([
      ["Languages::日本語", "cloze", "The {{c2::capital}} of Japan is {{c1::Tokyo}}", "", ["geo"], "mochi-card0001"],
      ["Languages::日本語", "basic", "犬", `dog ![dog.jpg](${mediaRef("dog.jpg")})`, ["animal", "n5"], "mochi-card0002"],
      ["Languages::日本語", "basic", "猫", "cat", [], "mochi-card0003"],
      ["Languages", "basic", 'Hello, "world"', "nǐ hǎo", [], "mochi-card0005"],
    ]);
    expect(d.media.map((m) => m.name)).toEqual(["dog.jpg"]);
    const { backup } = draftToBackup(d);
    expect(backup.decks.map((x) => x.name)).toEqual(["Languages", "日本語"]);
    expect(backup.media).toHaveLength(1);
  });
  it("reads transit data.json the same way", async () => {
    const json = JSON.stringify(["^ ", "~:version", 2, "~:decks", [["^ ", "~:id", "~:deck0001", "~:name", "Root", "~:cards", ["~#list", [["^ ", "^2", "~:c0000001", "~:content", "Q1\n---\nA1 ![](@media/dog.jpg)"], ["^ ", "^2", "~:c0000002", "^8", "Q2\n---\nA2"]]]], ["^ ", "^2", "~:deck0002", "^4", "Child", "~:parent-id", "^3", "^5", ["^6", [["^ ", "^2", "~:c0000003", "^8", "Q3\n---\nA3"]]]]]]);
    const d = await parseMochi(await mochiZip({ name: "data.json", text: json }));
    expect(d.notes.map((n) => [n.deckPath, n.fields.front, n.fields.back])).toEqual([
      ["Root", "Q1", `A1 ![dog.jpg](${mediaRef("dog.jpg")})`], ["Root", "Q2", "A2"], ["Root::Child", "Q3", "A3"],
    ]);
  });
  it("rejects zips without a Mochi data file", async () => {
    const z = new JSZip(); z.file("x.txt", "hi");
    await expect(parseMochi(await z.generateAsync({ type: "uint8array" }))).rejects.toThrow("not_mochi");
  });
});
