import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import * as cards from "@/server/repo/cards";
import { q } from "@/server/db";
import { getStudyState, answer } from "@/server/services/study";
import { createShare, listShares, revokeShare, updateShare, getPublicShare, cloneShare, mediaUrlsSafeToDelete } from "@/server/services/share";

const BLOB = "https://abc.public.blob.vercel-storage.com/u1/pic-xyz.png";

describe("deck sharing (PGlite)", () => {
  let owner: number, other: number, third: number;
  let root: number, child: number, sibling: number, filtered: number;
  let slug: string, shareId: number;

  beforeAll(async () => {
    await usePglite();
    owner = (await users.createUser("owner@test.dev", "h", "Owner")).id;
    other = (await users.createUser("other@test.dev", "h", "Other")).id;
    third = (await users.createUser("third@test.dev", "h", "Third")).id;
    root = (await decks.createDeck(owner, { name: "Japanese" })).id;
    child = (await decks.createDeck(owner, { name: "Kanji", parentId: root })).id;
    sibling = (await decks.createDeck(owner, { name: "Private diary" })).id;
    await notes.createNote(owner, { deckId: root, type: "basic", fields: { front: "犬", back: `dog ![d](${BLOB})` }, tags: ["jp", "animals"] });
    await notes.createNote(owner, { deckId: child, type: "cloze", fields: { text: "{{c1::日}} = sun {{c2::月}} = moon", extra: "$x^2$" }, tags: ["jp::kanji"] });
    await notes.createNote(owner, { deckId: child, type: "basic", fields: { front: "deleted", back: "x" }, tags: [] }).then((n) => notes.softDeleteNotes(owner, [n.id]));
    await notes.createNote(owner, { deckId: sibling, type: "basic", fields: { front: "SECRET", back: "my password hint" }, tags: ["private"] });
    await q("INSERT INTO ak_media (user_id, url, pathname, filename, content_type, size) VALUES ($1, $2, 'u1/pic-xyz.png', 'pic.png', 'image/png', 123)", [owner, BLOB]);
    await q("INSERT INTO ak_media (user_id, url, pathname, filename, content_type, size) VALUES ($1, 'https://abc.public.blob.vercel-storage.com/u1/other.png', 'u1/other.png', 'other.png', 'image/png', 9)", [owner]);
    // owner studies a card so it has scheduling that must NOT be cloned
    const st = await getStudyState(owner, root);
    await answer(owner, st!.card!.cardId, 4, 1000);
    filtered = (await decks.createDeck(owner, { name: "F", filtered: true, filter: { query: "", limit: 10, order: "due" } })).id;
  });

  it("owner creates an unguessable share link for a deck subtree", async () => {
    const s = await createShare(owner, root, { description: "JLPT N5 starter" });
    expect(s.slug.length).toBeGreaterThanOrEqual(22);
    expect(s.description).toBe("JLPT N5 starter");
    expect(s.expiresAt).toBeNull();
    expect(s.viewCount).toBe(0);
    slug = s.slug; shareId = s.id;
    expect((await listShares(owner)).map((x) => x.id)).toEqual([shareId]);
    expect((await listShares(owner, root)).length).toBe(1);
  });

  it("cannot share a deck you do not own, a filtered deck, or a deleted deck", async () => {
    await expect(createShare(other, root, {})).rejects.toMatchObject({ status: 404 });
    await expect(createShare(owner, filtered, {})).rejects.toMatchObject({ status: 400 });
    expect(await listShares(other)).toEqual([]);
    expect(await revokeShare(other, shareId)).toBe(false);
    expect(await updateShare(other, shareId, { description: "pwn" })).toBe(false);
    expect((await listShares(owner))[0].revokedAt).toBeNull();
  });

  it("public view exposes only the shared subtree, counts views, and no owner identity", async () => {
    const p = await getPublicShare(slug);
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Japanese");
    expect(p!.description).toBe("JLPT N5 starter");
    expect(p!.noteCount).toBe(2);
    expect(p!.cardCount).toBe(3); // basic(1) + cloze(2); deleted note excluded
    expect(p!.decks.map((d) => d.path)).toEqual(["Japanese", "Japanese::Kanji"]);
    const json = JSON.stringify(p);
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain("Private diary");
    expect(json).not.toContain("owner@test.dev");
    expect(json).not.toContain("deleted");
    expect(json).not.toMatch(/"(stability|difficulty|due|reps|userId|user_id)"/);
    expect(json).not.toContain("other.png"); // owner's unrelated media
    expect(p!.samples.length).toBe(2);
    expect(p!.samples[0].fields).toBeTruthy();
    await getPublicShare(slug);
    expect((await listShares(owner))[0].viewCount).toBe(2);
    await getPublicShare(slug, { countView: false });
    expect((await listShares(owner))[0].viewCount).toBe(2);
  });

  it("unknown or malformed slugs 404", async () => {
    expect(await getPublicShare("A".repeat(22))).toBeNull();
    expect(await getPublicShare("../../etc/passwd")).toBeNull();
    expect(await getPublicShare("")).toBeNull();
  });

  it("other user cannot read the unshared sibling deck through any share", async () => {
    const p = await getPublicShare(slug, { countView: false });
    expect(p!.decks.some((d) => d.name === "Private diary")).toBe(false);
    // moving the private deck out of the subtree later keeps it hidden; moving a deck INTO the subtree shares it (live subtree)
    expect(await decks.getDeck(other, sibling)).toBeNull();
  });

  it("clones as NEW cards (no scheduling), with sub-decks, tags and media references", async () => {
    const r = await cloneShare(other, slug);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(0);
    expect(r.cards).toBe(3);
    const mine = await decks.listDecks(other);
    const rootClone = mine.find((d) => d.id === r.rootDeckId)!;
    expect(rootClone.name).toBe("Japanese");
    expect(mine.find((d) => d.parentId === rootClone.id)?.name).toBe("Kanji");
    const rows = await q("SELECT n.guid, n.tags, c.state, c.reps, c.stability, c.due FROM ak_notes n JOIN ak_cards c ON c.note_id = n.id WHERE n.user_id = $1 AND n.deck_id = ANY($2::int[])", [other, mine.map((d) => d.id)]);
    expect(rows.length).toBe(3);
    for (const row of rows) { expect(row.state).toBe("new"); expect(Number(row.reps)).toBe(0); expect(Number(row.stability)).toBe(0); }
    expect(rows.flatMap((x) => x.tags as string[])).toEqual(expect.arrayContaining(["jp", "animals", "jp::kanji"]));
    expect((await q("SELECT count(*)::int AS n FROM ak_revlog WHERE user_id = $1", [other]))[0].n).toBe(0);
    const media = await q("SELECT url FROM ak_media WHERE user_id = $1", [other]);
    expect(media.map((m) => m.url)).toEqual([BLOB]);
    expect((await q("SELECT name FROM ak_tags WHERE user_id = $1 ORDER BY name", [other])).map((t) => t.name)).toEqual(expect.arrayContaining(["jp", "jp::kanji"]));
    const st = await getStudyState(other, rootClone.id);
    expect(st!.counts.new).toBeGreaterThanOrEqual(2); // cloze siblings may be counted once (sibling burying)
    expect((await listShares(owner))[0].cloneCount).toBe(1);
  });

  it("owner's later edits do not affect clones; re-clone dedupes by guid and adds only new notes", async () => {
    const ownerNotes = await q("SELECT id FROM ak_notes WHERE user_id = $1 AND deck_id = $2 AND deleted_at IS NULL", [owner, root]);
    await notes.updateNote(owner, Number(ownerNotes[0].id), { fields: { front: "犬 (edited)" } });
    await notes.createNote(owner, { deckId: child, type: "basic", fields: { front: "山", back: "mountain" }, tags: ["jp"] });
    const otherFronts = async () => (await q("SELECT fields->>'front' AS f FROM ak_notes WHERE user_id = $1 ORDER BY id", [other])).map((x) => x.f);
    expect(await otherFronts()).toContain("犬");
    expect(await otherFronts()).not.toContain("犬 (edited)");
    const r = await cloneShare(other, slug);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(2);
    expect(await otherFronts()).toContain("山");
    // the new note lands in the same cloned sub-deck, no duplicate decks
    const mine = await decks.listDecks(other);
    expect(mine.filter((d) => d.name === "Japanese").length).toBe(1);
    expect(mine.filter((d) => d.name === "Kanji").length).toBe(1);
  });

  it("studying the clone never touches the owner's cards", async () => {
    const mine = await decks.listDecks(other);
    const st = await getStudyState(other, mine.find((d) => d.name === "Japanese")!.id);
    await answer(other, st!.card!.cardId, 3, 1000);
    const ownerCards = await q("SELECT reps FROM ak_cards WHERE user_id = $1", [owner]);
    expect(ownerCards.reduce((a, c) => a + Number(c.reps), 0)).toBe(1);
  });

  it("media shared with a clone is not deleted when either account is deleted", async () => {
    expect(await mediaUrlsSafeToDelete(owner)).toEqual(["https://abc.public.blob.vercel-storage.com/u1/other.png"]);
    expect(await mediaUrlsSafeToDelete(other)).toEqual([]);
  });

  it("enforces clone size and rate limits", async () => {
    await expect(cloneShare(third, slug, { limits: { maxNotes: 2, perHour: 10 } })).rejects.toMatchObject({ status: 413 });
    await expect(cloneShare(third, slug, { limits: { maxNotes: 100, perHour: 0 } })).rejects.toMatchObject({ status: 429 });
    expect(await decks.listDecks(third)).toEqual([]);
  });

  it("expired links 404 for view and clone", async () => {
    const s = await createShare(owner, child, { expiresInDays: 1 });
    expect(await getPublicShare(s.slug)).not.toBeNull();
    const later = new Date(Date.now() + 2 * 86400000);
    expect(await getPublicShare(s.slug, { now: later })).toBeNull();
    await expect(cloneShare(third, s.slug, { now: later })).rejects.toMatchObject({ status: 404 });
    // owner can extend / clear expiry
    expect(await updateShare(owner, s.id, { expiresInDays: null })).toBe(true);
    expect(await getPublicShare(s.slug, { now: later, countView: false })).not.toBeNull();
  });

  it("revoked links 404 for view and clone; deleted decks 404", async () => {
    expect(await revokeShare(owner, shareId)).toBe(true);
    expect(await getPublicShare(slug)).toBeNull();
    await expect(cloneShare(third, slug)).rejects.toMatchObject({ status: 404 });
    const s = await createShare(owner, child, {});
    await decks.softDeleteDeck(owner, child);
    expect(await getPublicShare(s.slug)).toBeNull();
    await decks.restoreDeck(owner, child);
    expect(await getPublicShare(s.slug, { countView: false })).not.toBeNull();
  });

  it("cloning your own share adds nothing", async () => {
    const s = await createShare(owner, root, {});
    const before = (await decks.listDecks(owner)).length;
    const r = await cloneShare(owner, s.slug);
    expect(r.added).toBe(0);
    expect((await decks.listDecks(owner)).length).toBe(before);
    expect(r.own).toBe(true);
  });

  it("cards keep ordinals for cloze notes", async () => {
    const mine = await q("SELECT id FROM ak_notes WHERE user_id = $1 AND type = 'cloze'", [other]);
    expect((await cards.listCardsForNote(other, Number(mine[0].id))).map((c) => c.ord)).toEqual([1, 2]);
  });
});
