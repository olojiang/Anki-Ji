import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs from "sql.js";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import * as decks from "@/server/repo/decks";
import * as notes from "@/server/repo/notes";
import { getStudyState, answer } from "@/server/services/study";
import { exportBackup, importBackupDecks, importBackupNotes } from "@/server/services/backup";
import { exportApkg } from "@/core/io/apkg-export";
import { parseImportFile } from "@/core/io/registry";
import { nestNotes } from "@/core/io/backup";
import { dayIndex } from "@/core/time";
import { q } from "@/server/db";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123";

describe(".apkg export → import between two accounts (real Postgres)", () => {
  let a: number, b: number;
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("ix-a@test.dev", "h", "A", { timezone: "Asia/Shanghai", rolloverHour: 4 })).id;
    b = (await users.createUser("ix-b@test.dev", "h", "B", { timezone: "Asia/Shanghai", rolloverHour: 4 })).id;
    const root = await decks.createDeck(a, { name: "Export" });
    const sub = await decks.createDeck(a, { name: "Sub", parentId: root.id });
    await notes.createNote(a, { deckId: sub.id, type: "basic", fields: { front: "q1", back: "a1" }, tags: ["t"] });
    await notes.createNote(a, { deckId: root.id, type: "cloze", fields: { text: "{{c1::x}} {{c2::y}}" }, tags: [] });
    // study a few cards so there is scheduling + history
    for (let i = 0; i < 3; i++) {
      const st = await getStudyState(a, root.id);
      if (!st?.card) break;
      await answer(a, st.card.cardId, 3, 2000);
    }
  }, 90_000);

  it("keeps notes, card states and review history, and assigns study days to imported reviews", async () => {
    const backup = await exportBackup(a);
    const SQL = await initSqlJs();
    const root = backup.decks.find((d) => d.name === "Export")!;
    const { bytes, stats } = await exportApkg({ backup, deckId: root.id, includeScheduling: true, media: [], SQL });
    expect(stats.notes).toBe(2);
    expect(stats.revlog).toBe(backup.revlog.length);
    const parsed = await parseImportFile("e.apkg", bytes, { defaultDeck: "Default", loadSqlJs: async () => SQL });
    const deckMap = await importBackupDecks(b, parsed.backup.decks);
    const res = await importBackupNotes(b, nestNotes(parsed.backup), deckMap);
    expect(res).toMatchObject({ notes: 2, cards: 3, revlog: backup.revlog.length });

    const mine = await q("SELECT n.guid, c.ord, c.state, c.reps, c.stability, c.difficulty FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id WHERE c.user_id = $1 ORDER BY n.guid, c.ord", [a]);
    const theirs = await q("SELECT n.guid, c.ord, c.state, c.reps, c.stability, c.difficulty FROM ak_cards c JOIN ak_notes n ON n.id = c.note_id WHERE c.user_id = $1 ORDER BY n.guid, c.ord", [b]);
    expect(theirs.map((r) => [r.guid, r.ord, r.state, r.reps])).toEqual(mine.map((r) => [r.guid, r.ord, r.state, r.reps]));
    for (let i = 0; i < mine.length; i++) {
      expect(Number(theirs[i].stability)).toBeCloseTo(Number(mine[i].stability), 3);
      if (mine[i].state !== "new") expect(Number(theirs[i].difficulty)).toBeCloseTo(Number(mine[i].difficulty), 3);
    }
    const days = await q("SELECT day, reviewed_at FROM ak_revlog WHERE user_id = $1", [b]);
    expect(days.length).toBe(backup.revlog.length);
    for (const r of days) expect(Number(r.day)).toBe(dayIndex(new Date(String(r.reviewed_at instanceof Date ? (r.reviewed_at as Date).toISOString() : r.reviewed_at)), "Asia/Shanghai", 4));
    const paths = (await decks.listDecks(b)).map((d) => d.name).sort();
    expect(paths).toEqual(["Export", "Sub"]);
  });
});
