import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseXml, childText } from "@/core/io/xml";
import { parseSuperMemoXml } from "@/core/io/supermemo";
import { parseMnemosyneXml, parseMnemosyneCards } from "@/core/io/mnemosyne";
import { mediaRef } from "@/core/io/draft";

const fx = (n: string) => readFileSync(new URL(`./fixtures/import/${n}`, import.meta.url), "utf8");
const rows = (d: { notes: { deckPath: string; type: string; fields: Record<string, unknown>; tags: string[] }[] }) =>
  d.notes.map((n) => [n.deckPath, n.type, n.fields.front ?? n.fields.text, n.fields.back ?? n.fields.extra, n.tags]);

describe("XML reader", () => {
  it("parses elements, attributes, entities, CDATA, comments and self-closing tags", () => {
    const doc = parseXml('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2" y=\'q\'><b>t &lt;&#65;&#x42;&gt;</b><c/><d><![CDATA[<i>raw</i>]]></d></a>');
    expect(doc.name).toBe("a");
    expect(doc.attrs).toEqual({ x: "1 & 2", y: "q" });
    expect(childText(doc, "b")).toBe("t <AB>");
    expect(doc.children.map((c) => c.name)).toEqual(["b", "c", "d"]);
    expect(childText(doc, "d")).toBe("<i>raw</i>");
  });
});

describe("SuperMemo XML", () => {
  it("maps Topic elements to nested decks and Items to basic notes", () => {
    expect(rows(parseSuperMemoXml(fx("supermemo.xml"), { rootDeck: "SM" }))).toEqual([
      ["SM::Geography", "basic", "Capital of France?", "Paris", []],
      ["SM::Geography::Europe", "basic", "<b>Largest</b> country?", "Russia & more 中国", []],
    ]);
  });
});

describe("Mnemosyne", () => {
  it("1.x XML: categories → decks, Q/A items with stable ids", () => {
    const d = parseMnemosyneXml(fx("mnemosyne1.xml"), { rootDeck: "Mnemo" });
    expect(rows(d)).toEqual([
      ["Mnemo::French", "basic", "chat", "cat", []],
      ["Mnemo::French", "basic", "chien", "dog", []],
      ["Mnemo", "basic", "no category", "x", []],
    ]);
    expect(d.notes[0].guid).toBe("mnemosyne-abc");
  });
  it("2.x cards.xml: facts + card types (front-back, both ways, vocabulary, cloze), tags → deck/tags", () => {
    const d = parseMnemosyneXml(fx("mnemosyne-cards.xml"), { rootDeck: "Mnemo" });
    expect(rows(d)).toEqual([
      ["Mnemo::Languages::Spanish", "basic", "hola", "hello", ["Languages::Spanish"]],
      ["Mnemo::Languages::Spanish", "basic_reverse", "perro", "ˈpero\ndog\nnoun", ["Languages::Spanish"]],
      ["Mnemo", "cloze", "The {{c1::sun}} is a {{c2::star}}", "", []],
      ["Mnemo::Languages::Spanish", "basic_reverse", "picture", '<img src="pics/sun.png">', ["Languages::Spanish"]],
    ]);
    expect(d.notes.map((n) => n.guid)).toEqual(["mnemosyne-f1", "mnemosyne-f2", "mnemosyne-f3", "mnemosyne-f4"]);
  });
  it(".cards zip bundles media referenced by <img src>", async () => {
    const z = new JSZip();
    z.file("cards.xml", fx("mnemosyne-cards.xml"));
    z.file("METADATA", "author_name: me");
    z.file("pics/sun.png", new Uint8Array([1, 2]));
    const d = await parseMnemosyneCards(await z.generateAsync({ type: "uint8array" }), { rootDeck: "Mnemo" });
    expect(d.notes[3].fields.back).toBe(`<img src="${mediaRef("pics/sun.png")}">`);
    expect(d.media.map((m) => m.name)).toEqual(["pics/sun.png"]);
  });
});
