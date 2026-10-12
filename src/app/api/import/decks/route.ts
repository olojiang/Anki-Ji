import { authed, body } from "@/server/http";
import { importBackupDecks } from "@/server/services/backup";
import { toDeckRecord } from "@/core/io/backup";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ decks: Record<string, unknown>[] }>(req);
  return { deckMap: await importBackupDecks(uid, (b.decks ?? []).map(toDeckRecord)) };
});
