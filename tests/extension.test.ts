import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  normalizeServerUrl, endpointFor, parseTags, escapeHtml, textToHtml, sourceHtml, prefillFromSelection, buildNote, clozeWrap, ankiRequest, isFreshCapture, MODELS,
} from "../extension/lib.js";

describe("extension pure logic", () => {
  it("normalises server URLs", () => {
    expect(normalizeServerUrl("anki-ji.vercel.app")).toBe("https://anki-ji.vercel.app");
    expect(normalizeServerUrl(" https://anki-ji.vercel.app/ ")).toBe("https://anki-ji.vercel.app");
    expect(normalizeServerUrl("http://localhost:3406/api/ankiconnect")).toBe("http://localhost:3406");
    expect(normalizeServerUrl("https://x.dev/sub/path//")).toBe("https://x.dev/sub/path");
    expect(() => normalizeServerUrl("")).toThrow();
    expect(() => normalizeServerUrl("ftp://x")).toThrow();
    expect(endpointFor("https://a.b")).toBe("https://a.b/api/ankiconnect");
  });
  it("parses tags", () => {
    expect(parseTags(" jp, vocab  web::clip jp ")).toEqual(["jp", "vocab", "web::clip"]);
    expect(parseTags("")).toEqual([]);
  });
  it("escapes and formats HTML", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    expect(textToHtml("a < b\nc")).toBe("a &lt; b<br>c");
    expect(sourceHtml("https://ex.com/a?b=1&c=2", "Title <x>")).toBe('<div class="ak-src">— <a href="https://ex.com/a?b=1&amp;c=2">Title &lt;x&gt;</a></div>');
    expect(sourceHtml("https://ex.com/page", "")).toContain(">ex.com</a>");
    expect(sourceHtml("javascript:alert(1)", "x")).toBe("");
    expect(sourceHtml("", "x")).toBe("");
  });
  it("prefills front/back from a selection", () => {
    expect(prefillFromSelection("  食べる  ")).toEqual({ front: "食べる", back: "" });
    expect(prefillFromSelection("ephemeral — lasting a very short time")).toEqual({ front: "ephemeral", back: "lasting a very short time" });
    expect(prefillFromSelection("term: definition here")).toEqual({ front: "term", back: "definition here" });
    expect(prefillFromSelection("Question line\nAnswer line 1\nline 2")).toEqual({ front: "Question line", back: "Answer line 1\nline 2" });
    expect(prefillFromSelection("http://not-a-term: x")).toEqual({ front: "http://not-a-term: x", back: "" });
    const long = "x".repeat(5000);
    expect(prefillFromSelection(long).front.length).toBeLessThanOrEqual(4000);
  });
  it("wraps cloze", () => {
    expect(clozeWrap("Tokyo is the capital", 0, 5)).toBe("{{c1::Tokyo}} is the capital");
    expect(clozeWrap("{{c1::a}} b", 10, 11)).toBe("{{c1::a}} {{c2::b}}");
    expect(clozeWrap("abc", 2, 2)).toBe("abc");
  });
  it("builds AnkiConnect notes for each model", () => {
    const basic = buildNote({ front: "a<b", back: "c", deck: "Lang", tags: "x y", model: "Basic", sourceUrl: "https://e.com", sourceTitle: "E", includeSource: true });
    expect(basic).toEqual({ deckName: "Lang", modelName: "Basic", fields: { Front: "a&lt;b", Back: 'c<div class="ak-src">— <a href="https://e.com">E</a></div>' }, tags: ["x", "y"], options: { allowDuplicate: false, duplicateScope: "deck" } });
    const cloze = buildNote({ front: "{{c1::Tokyo}} capital", back: "", deck: "D", tags: "", model: "Cloze", sourceUrl: "", includeSource: true });
    expect(cloze.fields).toEqual({ Text: "{{c1::Tokyo}} capital", "Back Extra": "" });
    const rev = buildNote({ front: "f", back: "b", deck: "D", tags: "", model: "Basic (and reversed card)", sourceUrl: "https://e.com", includeSource: false });
    expect(rev.fields).toEqual({ Front: "f", Back: "b" });
    expect(() => buildNote({ front: " ", back: "", deck: "D", tags: "", model: "Basic" })).toThrow(/front/i);
    expect(() => buildNote({ front: "f", back: "", deck: "", tags: "", model: "Basic" })).toThrow(/deck/i);
    expect(() => buildNote({ front: "plain", back: "", deck: "D", tags: "", model: "Cloze" })).toThrow(/cloze/i);
    expect(MODELS).toContain("Cloze");
  });
  it("talks AnkiConnect through an injected fetch", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = async (url: string, init: RequestInit) => { calls.push({ url, init }); const b = JSON.parse(String(init.body)); return new Response(JSON.stringify(b.action === "deckNames" ? { result: ["A"], error: null } : { result: null, error: "boom" })); };
    expect(await ankiRequest(fake as typeof fetch, "https://s.dev", "akj_x", "deckNames")).toEqual(["A"]);
    expect(calls[0].url).toBe("https://s.dev/api/ankiconnect");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: "deckNames", version: 6, params: {}, key: "akj_x" });
    await expect(ankiRequest(fake as typeof fetch, "https://s.dev", "akj_x", "addNote", { note: {} })).rejects.toThrow("boom");
    const bad = async () => new Response("nope", { status: 502 });
    await expect(ankiRequest(bad as unknown as typeof fetch, "https://s.dev", "k", "version")).rejects.toThrow(/502/);
  });
  it("only uses recent context-menu captures", () => {
    expect(isFreshCapture({ text: "a", at: 1000 }, 1000 + 30_000)).toBe(true);
    expect(isFreshCapture({ text: "a", at: 1000 }, 1000 + 120_000)).toBe(false);
    expect(isFreshCapture(null, 0)).toBe(false);
  });
});

describe("extension package", () => {
  const dir = path.resolve(import.meta.dirname, "../extension");
  it("has a valid MV3 manifest with context menu, shortcut and options page", () => {
    const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    expect(m.manifest_version).toBe(3);
    expect(m.permissions).toEqual(expect.arrayContaining(["contextMenus", "storage", "activeTab", "scripting"]));
    expect(m.options_ui?.page ?? m.options_page).toBeTruthy();
    expect(m.commands?._execute_action?.suggested_key?.default).toBe("Alt+Shift+A");
    for (const f of [m.background.service_worker, m.action.default_popup, m.options_ui.page, ...Object.values(m.icons)]) expect(statSync(path.join(dir, String(f))).isFile()).toBe(true);
  });
  it("public/anki-ji-extension.zip is up to date with /extension", async () => {
    const zip = await JSZip.loadAsync(readFileSync(path.resolve(dir, "../public/anki-ji-extension.zip")));
    const want = new Map<string, Buffer>();
    const walk = (d: string, rel = "") => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p, `${rel}${f}/`); else if (!f.endsWith(".d.ts")) want.set(`${rel}${f}`, readFileSync(p)); } };
    walk(dir);
    const have = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
    expect(have).toEqual([...want.keys()].sort());
    for (const [name, buf] of want) expect(Buffer.from(await zip.file(name)!.async("uint8array")).equals(buf), name).toBe(true);
  });
});
