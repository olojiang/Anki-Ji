import { authed, body, ids, HttpError } from "@/server/http";
import * as notes from "@/server/repo/notes";
import * as cards from "@/server/repo/cards";
import { userContext } from "@/server/services/context";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ action: string; noteIds?: number[]; cardIds?: number[]; deckId?: number; tags?: string[]; flag?: number; index?: number }>(req);
  const n = ids(b.noteIds);
  const c = b.cardIds ? ids(b.cardIds) : n.length ? await cards.cardIdsForNotes(uid, n) : [];
  switch (b.action) {
    case "delete": await notes.softDeleteNotes(uid, n); break;
    case "restore": await notes.restoreNotes(uid, n); break;
    case "purge": await notes.purgeNotes(uid, n); break;
    case "move": await notes.moveNotes(uid, n, Number(b.deckId)); break;
    case "addTags": await notes.bulkTags(uid, n, b.tags ?? [], []); break;
    case "removeTags": await notes.bulkTags(uid, n, [], b.tags ?? []); break;
    case "suspend": await cards.setSuspended(uid, c, true); break;
    case "unsuspend": await cards.setSuspended(uid, c, false); break;
    case "bury": await cards.setBuried(uid, c, (await userContext(uid)).today); break;
    case "unbury": await cards.setBuried(uid, c, null); break;
    case "flag": await cards.setFlag(uid, c, Number(b.flag) || 0); break;
    case "reset": await cards.resetCards(uid, c); break;
    case "reorder": if (n[0]) await notes.moveNoteToIndex(uid, n[0], Number(b.index) || 0); break;
    default: throw new HttpError(400, "unknown_action");
  }
  return { ok: true };
});
