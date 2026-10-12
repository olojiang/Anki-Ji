import { q } from "../db";

export async function listTags(uid: number): Promise<string[]> {
  const rows = await q(
    `SELECT name FROM ak_tags WHERE user_id = $1
     UNION SELECT DISTINCT unnest(tags) AS name FROM ak_notes WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY name`, [uid]);
  return rows.map((r) => String(r.name));
}

export async function addTags(uid: number, tags: string[]) {
  const clean = [...new Set(tags.map(normalizeTag).filter(Boolean))];
  if (!clean.length) return;
  await q("INSERT INTO ak_tags (user_id, name) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING", [uid, clean]);
}

export function normalizeTag(t: string): string {
  return t.trim().replace(/\s+/g, "_").replace(/^:+|:+$/g, "");
}

/** Rename a tag and all its children (a → b turns a::x into b::x). */
export async function renameTag(uid: number, from: string, to: string) {
  const f = normalizeTag(from), t = normalizeTag(to);
  if (!f || !t || f === t) return;
  const sub = `ARRAY(SELECT DISTINCT CASE WHEN x = $2 THEN $3 WHEN x LIKE $2 || '::%' THEN $3 || substr(x, length($2) + 1) ELSE x END FROM unnest(tags) x)`;
  await q(`UPDATE ak_notes SET tags = ${sub} WHERE user_id = $1 AND EXISTS (SELECT 1 FROM unnest(tags) x WHERE x = $2 OR x LIKE $2 || '::%')`, [uid, f, t]);
  const rows = await q("SELECT name FROM ak_tags WHERE user_id = $1 AND (name = $2 OR name LIKE $2 || '::%')", [uid, f]);
  await q("DELETE FROM ak_tags WHERE user_id = $1 AND (name = $2 OR name LIKE $2 || '::%')", [uid, f]);
  await addTags(uid, rows.map((r) => (String(r.name) === f ? t : t + String(r.name).slice(f.length))));
}

/** Delete a tag (and its children) from every note. */
export async function deleteTag(uid: number, name: string) {
  const n = normalizeTag(name);
  await q("UPDATE ak_notes SET tags = ARRAY(SELECT x FROM unnest(tags) x WHERE NOT (x = $2 OR x LIKE $2 || '::%')) WHERE user_id = $1", [uid, n]);
  await q("DELETE FROM ak_tags WHERE user_id = $1 AND (name = $2 OR name LIKE $2 || '::%')", [uid, n]);
}
