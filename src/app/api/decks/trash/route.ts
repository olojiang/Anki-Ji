import { authed } from "@/server/http";
import { listDecks } from "@/server/repo/decks";
import { listDeletedNotes } from "@/server/repo/notes";

export const GET = authed(async (_req, { uid }) => ({ decks: await listDecks(uid, { deleted: true }), notes: await listDeletedNotes(uid) }));
