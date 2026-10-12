import { authed, body, ids } from "@/server/http";
import { changeNoteType } from "@/server/services/batch";
import type { FieldMapping } from "@/core/batch";
import type { NoteType } from "@/core/types";

export const POST = authed(async (req, { uid }) => {
  const b = await body<{ noteIds?: number[]; targetType: NoteType; mapping?: FieldMapping; preview?: boolean }>(req);
  const mapping: FieldMapping = {};
  for (const [k, v] of Object.entries(b.mapping ?? {})) mapping[String(k)] = v == null || v === "" ? null : String(v);
  return changeNoteType(uid, { noteIds: ids(b.noteIds), targetType: b.targetType, mapping, preview: !!b.preview });
});
