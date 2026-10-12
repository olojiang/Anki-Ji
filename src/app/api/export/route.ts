import { authed } from "@/server/http";
import { exportBackup } from "@/server/services/backup";
import { listDecks } from "@/server/repo/decks";
import { notesToRows, toDelimited } from "@/core/io/csv";
import { deckPath } from "@/core/tree";

export const maxDuration = 60;

export const GET = authed(async (req, { uid }) => {
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const backup = await exportBackup(uid);
  if (format === "csv" || format === "tsv") {
    const decks = await listDecks(uid);
    const rows = notesToRows(backup.notes.map((n) => ({ deckPath: deckPath(decks, n.deckId), type: n.type, fields: n.fields, tags: n.tags })));
    const text = "\uFEFF" + toDelimited(rows, format === "csv" ? "," : "\t");
    return new Response(text, { headers: { "Content-Type": `text/${format === "csv" ? "csv" : "tab-separated-values"}; charset=utf-8`, "Content-Disposition": `attachment; filename="anki-ji-notes.${format}"` } });
  }
  return backup;
});
