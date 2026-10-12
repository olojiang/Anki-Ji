// Pure helpers for the Anki-ji capture extension (no chrome.* APIs here — unit-tested in tests/extension.test.ts).

export const MODELS = ["Basic", "Basic (and reversed card)", "Cloze"];
export const CAPTURE_TTL_MS = 60_000;
const MAX_FIELD = 4000;

/** "anki-ji.vercel.app" → "https://anki-ji.vercel.app"; strips trailing slashes and a pasted /api/ankiconnect. */
export function normalizeServerUrl(input) {
  let s = String(input ?? "").trim();
  if (!s) throw new Error("Server URL is required");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (/^(localhost|127\.0\.0\.1)(:|$)/i.test(s) ? "http://" : "https://") + s;
  let u;
  try { u = new URL(s); } catch { throw new Error("Invalid server URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Server URL must start with http:// or https://");
  let p = u.pathname.replace(/\/+$/, "").replace(/\/api\/ankiconnect$/i, "").replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${p}`;
}

export const endpointFor = (base) => `${base}/api/ankiconnect`;

export function parseTags(s) {
  return [...new Set(String(s ?? "").split(/[\s,，]+/).map((t) => t.trim()).filter(Boolean))];
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function textToHtml(s) {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

/** Small attribution line linking back to the page the text came from. */
export function sourceHtml(url, title) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  let label = String(title ?? "").trim();
  if (!label) { try { label = new URL(url).host; } catch { label = url; } }
  return `<div class="ak-src">— <a href="${escapeHtml(url)}">${escapeHtml(label.slice(0, 200))}</a></div>`;
}

/** Guess front/back from selected text: "term — definition", "term: definition", or first line / rest. */
export function prefillFromSelection(text) {
  const t = String(text ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_FIELD);
  if (!t) return { front: "", back: "" };
  const nl = t.indexOf("\n");
  if (nl > 0) return { front: t.slice(0, nl).trim(), back: t.slice(nl + 1).trim() };
  const dash = /^(.{1,80}?)\s+[—–-]\s+(.+)$/.exec(t);
  if (dash) return { front: dash[1].trim(), back: dash[2].trim() };
  const colon = /^([^:：/]{1,60})[:：](?!\/\/)\s*(.+)$/.exec(t);
  if (colon) return { front: colon[1].trim(), back: colon[2].trim() };
  return { front: t, back: "" };
}

/** Wrap text[start, end) in the next free cloze number. */
export function clozeWrap(text, start, end) {
  const s = String(text ?? "");
  if (end <= start) return s;
  const used = [...s.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]));
  const n = used.length ? Math.max(...used) + 1 : 1;
  return `${s.slice(0, start)}{{c${n}::${s.slice(start, end)}}}${s.slice(end)}`;
}

/** Build an AnkiConnect `addNote` note. Throws a readable error for missing input. */
export function buildNote({ front, back, deck, tags, model, sourceUrl, sourceTitle, includeSource }) {
  const f = String(front ?? "").trim(), b = String(back ?? "").trim();
  if (!f) throw new Error("Front is empty");
  if (!String(deck ?? "").trim()) throw new Error("Choose a deck");
  const src = includeSource ? sourceHtml(sourceUrl, sourceTitle) : "";
  let fields;
  if (model === "Cloze") {
    if (!/\{\{c\d+::/.test(f)) throw new Error("Cloze needs at least one {{c1::…}} — select text and press “[…]”");
    fields = { Text: textToHtml(f), "Back Extra": textToHtml(b) + src };
  } else {
    fields = { Front: textToHtml(f), Back: textToHtml(b) + src };
  }
  return { deckName: String(deck).trim(), modelName: MODELS.includes(model) ? model : "Basic", fields, tags: parseTags(tags), options: { allowDuplicate: false, duplicateScope: "deck" } };
}

/** POST one AnkiConnect action; resolves to `result` or throws with the server's error. */
export async function ankiRequest(fetchImpl, base, token, action, params = {}) {
  const res = await fetchImpl(endpointFor(base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params, key: token }),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error(`Server error (${res.status})`); }
  if (!res.ok && !(data && data.error)) throw new Error(`Server error (${res.status})`);
  if (data && data.error) throw new Error(data.error);
  return data ? data.result : null;
}

export function isFreshCapture(capture, now) {
  return !!capture && typeof capture.at === "number" && now - capture.at < CAPTURE_TTL_MS;
}
