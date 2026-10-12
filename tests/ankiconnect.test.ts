import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import { createToken, listTokens, revokeToken, userForToken, hashToken } from "@/server/repo/tokens";
import { handleAnkiConnect } from "@/server/services/ankiconnect";
import { translateAnkiQuery } from "@/core/interop/query";
import { q } from "@/server/db";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

describe("translateAnkiQuery", () => {
  const m = (n: string) => ({ basic: "basic", "basic (and reversed card)": "basic_reverse" } as Record<string, string>)[n.toLowerCase()];
  it("maps note types, field searches and id filters", () => {
    expect(translateAnkiQuery('"deck:日本語::単語" "note:Basic (and reversed card)" Front:食べる', m)).toEqual({ query: "deck:日本語::単語 note:basic_reverse 食べる", nids: null, cids: null });
    expect(translateAnkiQuery("nid:1,2 tag:x", m)).toEqual({ query: "tag:x", nids: [1, 2], cids: null });
    expect(translateAnkiQuery("cid:7", m)).toEqual({ query: "", nids: null, cids: [7] });
    expect(translateAnkiQuery("deck:current is:due", m).query).toBe("is:due");
    expect(translateAnkiQuery("note:Nope", m).query).toBe("note:__no_such_model__");
    expect(translateAnkiQuery('-tag:a (x OR y) Back:*', m).query).toBe("-tag:a ( x or y )");
  });
});

describe("API tokens + AnkiConnect-compatible API", () => {
  let a: number, b: number, keyA: string, keyB: string, deckJp: number;
  const call = async (key: string | undefined, action: string, params: Record<string, unknown> = {}, version = 6) => handleAnkiConnect({ action, version, params, key }, null) as Promise<{ result: unknown; error: string | null }>;
  const ok = async (key: string, action: string, params: Record<string, unknown> = {}) => {
    const r = await call(key, action, params);
    expect(r.error).toBeNull();
    return r.result as never;
  };

  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("ac-a@test.dev", "h", "A")).id;
    b = (await users.createUser("ac-b@test.dev", "h", "B")).id;
    keyA = (await createToken(a, "yomitan")).token;
    keyB = (await createToken(b, "other")).token;
    const lang = await decks.createDeck(a, { name: "Lang" });
    deckJp = (await decks.createDeck(a, { name: "日本語", parentId: lang.id })).id;
  }, 90_000);

  it("creates tokens hashed at rest, lists without secrets, revokes", async () => {
    const t = await createToken(a, "temp");
    expect(t.token).toMatch(/^akj_[A-Za-z0-9_-]{32,}$/);
    const rows = await q("SELECT token_hash, prefix FROM ak_api_tokens WHERE id = $1", [t.id]);
    expect(rows[0].token_hash).toBe(hashToken(t.token));
    expect(rows[0].token_hash).not.toContain(t.token.slice(4));
    expect(t.token.startsWith(String(rows[0].prefix))).toBe(true);
    const list = await listTokens(a);
    expect(list.map((x) => x.name)).toContain("temp");
    expect(JSON.stringify(list)).not.toContain(t.token);
    expect(await userForToken(t.token)).toBe(a);
    expect(await revokeToken(b, t.id)).toBe(false); // other users cannot revoke
    expect(await revokeToken(a, t.id)).toBe(true);
    expect(await userForToken(t.token)).toBeNull();
    expect(await userForToken("akj_bogus")).toBeNull();
    expect(await userForToken("")).toBeNull();
  });

  it("requires a valid key (except requestPermission) and supports bearer tokens", async () => {
    expect((await call(undefined, "deckNames")).error).toMatch(/valid api key/);
    expect((await call("akj_nope", "deckNames")).error).toMatch(/valid api key/);
    expect(await handleAnkiConnect({ action: "requestPermission", version: 6 }, null)).toEqual({ result: { permission: "granted", requireApikey: true, version: 6 }, error: null });
    expect(await handleAnkiConnect({ action: "version", version: 6 }, keyA)).toEqual({ result: 6, error: null });
    // version ≤ 4 returns the bare result
    expect(await handleAnkiConnect({ action: "version", key: keyA }, null)).toBe(6);
    expect((await call(keyA, "noSuchAction")).error).toMatch(/unsupported action/);
    expect((await handleAnkiConnect("garbage", null) as { error: string }).error).toBeTruthy();
  });

  it("deckNames / deckNamesAndIds / createDeck", async () => {
    expect(await ok(keyA, "deckNames")).toEqual(["Lang", "Lang::日本語"]);
    const id = await ok(keyA, "createDeck", { deck: "Lang::日本語::動詞" });
    expect(typeof id).toBe("number");
    expect(await ok(keyA, "createDeck", { deck: "Lang::日本語::動詞" })).toBe(id);
    expect(await ok(keyA, "deckNamesAndIds")).toMatchObject({ "Lang::日本語::動詞": id, "Lang::日本語": deckJp });
    expect(await ok(keyB, "deckNames")).toEqual([]);
  });

  it("modelNames / modelFieldNames", async () => {
    const names = await ok(keyA, "modelNames") as string[];
    expect(names).toEqual(expect.arrayContaining(["Basic", "Basic (and reversed card)", "Cloze", "Basic (type in the answer)"]));
    expect(await ok(keyA, "modelFieldNames", { modelName: "Cloze" })).toEqual(["Text", "Back Extra"]);
    expect((await call(keyA, "modelFieldNames", { modelName: "Nope" })).error).toMatch(/model was not found/);
    expect(Object.keys(await ok(keyA, "modelNamesAndIds"))).toContain("Basic");
  });

  it("storeMediaFile + addNote with media, fields case-insensitive, duplicate & empty checks", async () => {
    expect(await ok(keyA, "storeMediaFile", { filename: "cat.png", data: "iVBORw0KGgo=" })).toBe("cat.png");
    expect((await call(keyA, "storeMediaFile", { filename: "x.png", path: "/etc/passwd" })).error).toBeTruthy();
    expect((await call(keyA, "storeMediaFile", { filename: "x.png", url: "file:///etc/passwd" })).error).toBeTruthy();
    const nid = await ok(keyA, "addNote", { note: { deckName: "Lang::日本語", modelName: "Basic", fields: { front: "猫 <img src=\"cat.png\">", Back: "cat [sound:cat.png]" }, tags: ["yomitan", "jp::n5"] } });
    expect(typeof nid).toBe("number");
    const n = await notes.getNote(a, nid);
    expect(n!.deckId).toBe(deckJp);
    expect(n!.fields.front).toMatch(/<img src="data:image\/png;base64,iVBORw0KGgo="/);
    expect(n!.fields.back).toContain("![audio](data:image/png;base64,");
    expect(n!.tags.sort()).toEqual(["jp::n5", "yomitan"]);
    expect(n!.cards).toHaveLength(1);
    // duplicate first field in the same model is rejected unless allowed
    const dup = { deckName: "Lang::日本語", modelName: "Basic", fields: { Front: "猫 <img src=\"cat.png\">", Back: "x" } };
    expect((await call(keyA, "addNote", { note: dup })).error).toMatch(/duplicate/);
    expect(typeof await ok(keyA, "addNote", { note: { ...dup, options: { allowDuplicate: true } } })).toBe("number");
    expect((await call(keyA, "addNote", { note: { deckName: "Lang", modelName: "Basic", fields: { Front: "  ", Back: "x" } } })).error).toMatch(/empty/);
    expect((await call(keyA, "addNote", { note: { deckName: "Nope", modelName: "Basic", fields: { Front: "a" } } })).error).toMatch(/deck was not found/);
    expect((await call(keyA, "addNote", { note: { deckName: "Lang", modelName: "Nope", fields: { Front: "a" } } })).error).toMatch(/model was not found/);
    // picture attachments (Yomitan style) are stored and appended to the named fields
    const pid = await ok(keyA, "addNote", { note: { deckName: "Lang", modelName: "Basic (and reversed card)", fields: { Front: "dog", Back: "犬" }, picture: [{ data: "iVBORw0KGgo=", filename: "dog.png", fields: ["Back"] }] } });
    const pn = await notes.getNote(a, pid);
    expect(pn!.type).toBe("basic_reverse");
    expect(pn!.cards).toHaveLength(2);
    expect(pn!.fields.back).toMatch(/犬<img src="data:image\/png/);
    // cloze
    const cid = await ok(keyA, "addNote", { note: { deckName: "Lang", modelName: "Cloze", fields: { Text: "{{c1::東京}} is the {{c2::capital}}" } } });
    expect((await notes.getNote(a, cid))!.cards.map((c) => c.ord)).toEqual([1, 2]);
    expect((await call(keyA, "addNote", { note: { deckName: "Lang", modelName: "Cloze", fields: { Text: "no cloze" } } })).error).toMatch(/cloze/);
  });

  it("addNotes / canAddNotes / canAddNotesWithErrorDetail", async () => {
    const good = { deckName: "Lang", modelName: "Basic", fields: { Front: "bulk-1", Back: "x" } };
    const bad = { deckName: "Lang", modelName: "Basic", fields: { Front: "", Back: "x" } };
    expect(await ok(keyA, "canAddNotes", { notes: [good, bad] })).toEqual([true, false]);
    const det = await ok(keyA, "canAddNotesWithErrorDetail", { notes: [good, bad] }) as { canAdd: boolean; error?: string }[];
    expect(det[0]).toEqual({ canAdd: true });
    expect(det[1].canAdd).toBe(false);
    const ids = await ok(keyA, "addNotes", { notes: [good, bad] }) as (number | null)[];
    expect(typeof ids[0]).toBe("number");
    expect(ids[1]).toBeNull();
    expect(await ok(keyA, "canAddNotes", { notes: [good] })).toEqual([false]);
  });

  it("findNotes / notesInfo / findCards / cardsInfo / guiBrowse", async () => {
    const found = await ok(keyA, "findNotes", { query: '"deck:Lang::日本語" Front:猫' }) as number[];
    expect(found.length).toBe(2);
    expect(await ok(keyA, "findNotes", { query: "note:Cloze" })).toHaveLength(1);
    const info = await ok(keyA, "notesInfo", { notes: [found[0], 999999] }) as Record<string, unknown>[];
    expect(info[0]).toMatchObject({ noteId: found[0], modelName: "Basic", tags: expect.any(Array) });
    expect((info[0].fields as Record<string, { value: string; order: number }>).Front.order).toBe(0);
    expect((info[0].cards as number[]).length).toBe(1);
    expect(info[1]).toEqual({});
    const cards = await ok(keyA, "findCards", { query: "deck:Lang" }) as number[];
    expect(cards.length).toBeGreaterThanOrEqual(6);
    const ci = await ok(keyA, "cardsInfo", { cards: [cards[0]] }) as Record<string, unknown>[];
    expect(ci[0]).toMatchObject({ cardId: cards[0], deckName: expect.stringMatching(/^Lang/), type: 0, queue: 0, interval: 0 });
    expect(await ok(keyA, "guiBrowse", { query: "deck:Lang" })).toEqual(cards);
    expect(await ok(keyA, "findNotes", { query: `nid:${found[0]}` })).toEqual([found[0]]);
  });

  it("updateNoteFields / addTags / removeTags / getTags", async () => {
    const [id] = await ok(keyA, "findNotes", { query: "bulk-1" }) as number[];
    expect(await ok(keyA, "updateNoteFields", { note: { id, fields: { Back: "updated" } } })).toBeNull();
    const n = await notes.getNote(a, id);
    expect(n!.fields).toMatchObject({ front: "bulk-1", back: "updated" });
    await ok(keyA, "addTags", { notes: [id], tags: "t1 t2" });
    expect((await notes.getNote(a, id))!.tags.sort()).toEqual(["t1", "t2"]);
    await ok(keyA, "removeTags", { notes: [id], tags: "t1" });
    expect((await notes.getNote(a, id))!.tags).toEqual(["t2"]);
    expect(await ok(keyA, "getTags")).toEqual(expect.arrayContaining(["t2", "yomitan"]));
  });

  it("isolates users: another token sees and changes nothing", async () => {
    const [id] = await ok(keyA, "findNotes", { query: "bulk-1" }) as number[];
    expect(await ok(keyB, "findNotes", { query: "" })).toEqual([]);
    expect(await ok(keyB, "findCards", { query: "" })).toEqual([]);
    expect(await ok(keyB, "notesInfo", { notes: [id] })).toEqual([{}]);
    const cards = await ok(keyA, "findCards", { query: "bulk-1" }) as number[];
    expect(await ok(keyB, "cardsInfo", { cards })).toEqual([{}]);
    expect((await call(keyB, "updateNoteFields", { note: { id, fields: { Back: "hacked" } } })).error).toMatch(/not found/);
    await call(keyB, "addTags", { notes: [id], tags: "hacked" });
    await call(keyB, "removeTags", { notes: [id], tags: "t2" });
    expect((await notes.getNote(a, id))!.tags).toEqual(["t2"]);
    expect((await notes.getNote(a, id))!.fields.back).toBe("updated");
    expect((await call(keyB, "addNote", { note: { deckName: "Lang", modelName: "Basic", fields: { Front: "x" } } })).error).toMatch(/deck was not found/);
    expect(await ok(keyB, "getTags")).toEqual([]);
  });

  it("multi runs sub-actions with their own versions", async () => {
    const r = await ok(keyA, "multi", { actions: [{ action: "version" }, { action: "deckNames", version: 6 }, { action: "nope", version: 6 }, { action: "nope" }] }) as unknown[];
    expect(r[0]).toBe(6);
    expect(r[1]).toEqual({ result: expect.arrayContaining(["Lang"]), error: null });
    expect(r[2]).toEqual({ result: null, error: expect.stringMatching(/unsupported/) });
    expect(r[3]).toEqual({ result: null, error: expect.stringMatching(/unsupported/) });
  });
});
