import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import { hashPassword, verifyPassword, signSession, verifySession } from "@/server/auth";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import * as cards from "@/server/repo/cards";
import * as tags from "@/server/repo/tags";
import { getStudyState, answer, undoLast } from "@/server/services/study";
import { exportBackup, importBackupDecks, importBackupNotes } from "@/server/services/backup";
import { nestNotes, normalizeForCompare } from "@/core/io/backup";
import { searchNotes } from "@/server/services/browse";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

describe("auth helpers", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("Passw0rd!");
    expect(h).not.toContain("Passw0rd!");
    expect(await verifyPassword("Passw0rd!", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("signs and verifies session tokens", async () => {
    const t = await signSession(42);
    expect(await verifySession(t)).toBe(42);
    expect(await verifySession(t + "x")).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
  });
});

describe("repositories + services on real Postgres (PGlite)", () => {
  let a: number, b: number;
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("a@test.dev", await hashPassword("x"), "A")).id;
    b = (await users.createUser("b@test.dev", await hashPassword("x"), "B")).id;
  });

  it("rejects duplicate emails (case-insensitive)", async () => {
    await expect(users.createUser("A@test.dev", "h", "dup")).rejects.toThrow();
    expect((await users.findByEmail("A@TEST.DEV"))?.id).toBe(a);
  });

  it("creates nested decks and notes with generated cards", async () => {
    const root = await decks.createDeck(a, { name: "Lang" });
    const child = await decks.createDeck(a, { name: "Japanese", parentId: root.id });
    const grand = await decks.createDeck(a, { name: "Kanji", parentId: child.id });
    expect((await decks.listDecks(a)).length).toBe(3);
    const n = await notes.createNote(a, { deckId: grand.id, type: "cloze", fields: { text: "{{c1::日}} {{c2::月}}" }, tags: ["jp::kanji"] });
    expect((await cards.listCardsForNote(a, n.id)).map((c) => c.ord)).toEqual([1, 2]);
    await notes.updateNote(a, n.id, { fields: { text: "{{c2::月}} {{c3::火}}" } });
    expect((await cards.listCardsForNote(a, n.id)).map((c) => c.ord)).toEqual([2, 3]);
    expect(await tags.listTags(a)).toContain("jp::kanji");
  });

  it("isolates data between users", async () => {
    const aDecks = await decks.listDecks(a);
    const deckId = aDecks[0].id;
    expect(await decks.listDecks(b)).toEqual([]);
    expect(await decks.getDeck(b, deckId)).toBeNull();
    expect(await decks.updateDeck(b, deckId, { name: "hacked" })).toBe(false);
    await decks.softDeleteDeck(b, deckId);
    expect((await decks.getDeck(a, deckId))?.deletedAt).toBeNull();
    await expect(notes.createNote(b, { deckId, type: "basic", fields: { front: "x", back: "y" }, tags: [] })).rejects.toThrow();
    const aNotes = await searchNotes(a, "");
    expect(aNotes.length).toBeGreaterThan(0);
    expect(await searchNotes(b, "")).toEqual([]);
    expect(await notes.getNote(b, aNotes[0].noteId)).toBeNull();
    expect(await notes.updateNote(b, aNotes[0].noteId, { fields: { front: "pwn" } })).toBe(false);
    const st = await getStudyState(b, deckId);
    expect(st).toBeNull();
    const aCard = (await cards.listCardsForNote(a, aNotes[0].noteId))[0];
    await expect(answer(b, aCard.id, 3, 1000)).rejects.toThrow();
    await cards.setSuspended(b, [aCard.id], true);
    expect((await cards.listCardsForNote(a, aNotes[0].noteId))[0].suspended).toBe(false);
    expect(await tags.listTags(b)).toEqual([]);
  });

  it("studies: answer updates scheduling, writes revlog, undo restores", async () => {
    const d = await decks.createDeck(a, { name: "Study" });
    await notes.createNote(a, { deckId: d.id, type: "basic", fields: { front: "Q1", back: "A1" }, tags: [] });
    await notes.createNote(a, { deckId: d.id, type: "basic", fields: { front: "Q2", back: "A2" }, tags: [] });
    const s1 = await getStudyState(a, d.id);
    expect(s1!.counts.new).toBe(2);
    expect(s1!.card!.front).toBe("Q1");
    expect(Object.keys(s1!.card!.intervals)).toEqual(["1", "2", "3", "4"]);
    await answer(a, s1!.card!.cardId, 3, 2000);
    const s2 = await getStudyState(a, d.id);
    expect(s2!.counts.new).toBe(1);
    expect(s2!.counts.learning).toBe(0); // learning card due in 10 minutes, not yet
    const u = await undoLast(a);
    expect(u?.cardId).toBe(s1!.card!.cardId);
    const s3 = await getStudyState(a, d.id);
    expect(s3!.counts.new).toBe(2);
  });

  it("exports and re-imports a full backup for another user", async () => {
    const backup = await exportBackup(a);
    expect(backup.notes.length).toBeGreaterThan(0);
    const deckMap = await importBackupDecks(b, backup.decks);
    const res = await importBackupNotes(b, nestNotes(backup), deckMap);
    expect(res.notes).toBe(backup.notes.length);
    const again = await exportBackup(b);
    const strip = (x: ReturnType<typeof normalizeForCompare>) => ({ ...x, settings: {}, revlog: x.revlog.length });
    expect(strip(normalizeForCompare(again))).toEqual(strip(normalizeForCompare(backup)));
  });

  it("deleting a user removes all their data", async () => {
    const before = (await decks.listDecks(a)).length;
    expect(before).toBeGreaterThan(0);
    await users.deleteUser(a);
    expect(await decks.listDecks(a)).toEqual([]);
    expect(await searchNotes(a, "")).toEqual([]);
    expect((await decks.listDecks(b)).length).toBeGreaterThan(0);
  });
});
