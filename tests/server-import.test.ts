import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import { importBackupDecks, importBackupNotes, existingNoteGuids } from "@/server/services/backup";
import { parseImportText } from "@/core/io/registry";
import { nestNotes } from "@/core/io/backup";

describe("re-import dedupe on real Postgres", () => {
  let a: number, b: number;
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("imp-a@test.dev", "h", "A")).id;
    b = (await users.createUser("imp-b@test.dev", "h", "B")).id;
  });
  it("reports existing guids per user and skips them on a second import", async () => {
    const p = parseImportText("smart", "# Bio\n猫：cat\nQ: 2+2?\nA: 4\nThe {{c1::sun}} is a star", { defaultDeck: "Paste" });
    expect(await existingNoteGuids(a, p.backup.notes.map((n) => n.guid))).toEqual([]);
    const map = await importBackupDecks(a, p.backup.decks);
    const r1 = await importBackupNotes(a, nestNotes(p.backup), map);
    expect(r1).toMatchObject({ notes: 3, cards: 3, skipped: 0 });
    expect((await existingNoteGuids(a, p.backup.notes.map((n) => n.guid))).sort()).toEqual(p.backup.notes.map((n) => n.guid).sort());
    expect(await existingNoteGuids(b, p.backup.notes.map((n) => n.guid))).toEqual([]); // isolation
    const again = parseImportText("smart", "# Bio\n猫：cat\nQ: 2+2?\nA: 4\nThe {{c1::sun}} is a star", { defaultDeck: "Paste" });
    const map2 = await importBackupDecks(a, again.backup.decks);
    expect(Object.values(map2).sort()).toEqual(Object.values(map).sort()); // decks reused, not duplicated
    const r2 = await importBackupNotes(a, nestNotes(again.backup), map2);
    expect(r2).toMatchObject({ notes: 0, skipped: 3 });
  });
});
