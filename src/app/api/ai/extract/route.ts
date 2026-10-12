import { authed, body, HttpError } from "@/server/http";
import { fetchUrlText, MAX_SOURCE_BYTES, textFromPdf } from "@/server/services/ai";

export const maxDuration = 30;

/** Source text for AI generation: multipart PDF/TXT/MD upload, or JSON { url } (server fetch + readable text). */
export const POST = authed(async (req) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new HttpError(400, "file_required");
    if (file.size > MAX_SOURCE_BYTES) throw new HttpError(413, "source_too_large");
    const name = (file as File).name || "file";
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.pdf$/i.test(name) || file.type === "application/pdf" || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      const r = textFromPdf(bytes);
      return { title: name.replace(/\.pdf$/i, ""), text: r.text, pages: r.pages };
    }
    if (/\.(txt|md|markdown|csv|tsv|html?)$/i.test(name) || file.type.startsWith("text/")) {
      const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
      return { title: name.replace(/\.[^.]+$/, ""), text };
    }
    throw new HttpError(400, "unsupported_source");
  }
  const { url } = await body<{ url?: string }>(req);
  if (!url || typeof url !== "string") throw new HttpError(400, "url_required");
  return fetchUrlText(url.trim());
});
