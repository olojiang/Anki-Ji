import { authed, ids } from "@/server/http";
import { getModeItems } from "@/server/services/modes";
import type { Direction } from "@/core/modes";

/** GET ?deck=ID | ?q=search | ?notes=1,2,3 [&dir=forward|reverse|both] — cram items (read-only, no scheduling). */
export const GET = authed(async (req, { uid }) => {
  const sp = req.nextUrl.searchParams;
  const dir = (["forward", "reverse", "both"].includes(sp.get("dir") ?? "") ? sp.get("dir") : "forward") as Direction;
  const deck = sp.get("deck");
  const notes = sp.get("notes");
  return getModeItems(uid, {
    deckId: deck ? Number(deck) : undefined,
    noteIds: notes ? ids(notes.split(",")) : undefined,
    query: deck || notes ? undefined : sp.get("q") ?? undefined,
    direction: dir,
  });
});
