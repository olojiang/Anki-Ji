import { put, del } from "@vercel/blob";
import { q } from "./db";

export const MAX_MEDIA_BYTES = 4 * 1024 * 1024; // Vercel function body limit is 4.5 MB

export async function storeMedia(uid: number, file: { name: string; type: string; bytes: ArrayBuffer }) {
  if (file.bytes.byteLength > MAX_MEDIA_BYTES) throw Object.assign(new Error("file_too_large"), { status: 413 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // local/dev fallback without Vercel Blob: inline data URL (small files only)
    if (file.bytes.byteLength > 1024 * 1024) throw Object.assign(new Error("file_too_large"), { status: 413 });
    const url = `data:${file.type || "application/octet-stream"};base64,${Buffer.from(file.bytes).toString("base64")}`;
    const r = await q("INSERT INTO ak_media (user_id, url, pathname, filename, content_type, size) VALUES ($1, $2, '', $3, $4, $5) RETURNING id", [uid, url, file.name, file.type, file.bytes.byteLength]);
    return { id: Number(r[0].id), url, filename: file.name, contentType: file.type, size: file.bytes.byteLength };
  }
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const blob = await put(`u${uid}/${Date.now()}-${safe}`, Buffer.from(file.bytes), { access: "public", contentType: file.type || undefined, addRandomSuffix: true });
  const rows = await q("INSERT INTO ak_media (user_id, url, pathname, filename, content_type, size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [uid, blob.url, blob.pathname, file.name, file.type, file.bytes.byteLength]);
  return { id: Number(rows[0].id), url: blob.url, filename: file.name, contentType: file.type, size: file.bytes.byteLength };
}

export async function deleteMediaUrls(urls: string[]) {
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try { await del(urls); } catch (e) { console.error("blob delete failed", e); }
}
