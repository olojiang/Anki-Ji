import { MODELS, ankiRequest, buildNote, clozeWrap, isFreshCapture, prefillFromSelection } from "./lib.js";

const $ = (id) => document.getElementById(id);
const setStatus = (text, kind = "") => { const s = $("status"); s.textContent = text; s.className = `status ${kind}`; };
let source = { url: "", title: "" };
let cfg = {};

async function selectionFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { text: "", url: "", title: "" };
  let text = "";
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection?.() ?? "") });
    text = res?.result ?? "";
  } catch { /* chrome:// pages etc. */ }
  return { text, url: tab.url ?? "", title: tab.title ?? "" };
}

async function init() {
  cfg = await chrome.storage.sync.get(["server", "token", "deck", "model", "tags", "includeSource"]);
  if (!cfg.server || !cfg.token) { $("setup").hidden = false; $("openOptions").onclick = () => chrome.runtime.openOptionsPage(); return; }
  $("form").hidden = false;
  for (const m of MODELS) $("model").append(new Option(m, m));
  $("model").value = MODELS.includes(cfg.model) ? cfg.model : "Basic";
  $("tags").value = cfg.tags ?? "";
  $("includeSource").checked = cfg.includeSource !== false;
  syncModel();

  const { capture } = await chrome.storage.session.get("capture");
  let picked;
  if (isFreshCapture(capture, Date.now())) { picked = capture; await chrome.storage.session.remove("capture"); }
  else picked = await selectionFromActiveTab();
  source = { url: picked.url ?? "", title: picked.title ?? "" };
  $("src").textContent = source.url ? `Source: ${source.title || source.url}` : "";
  const pre = prefillFromSelection(picked.text ?? "");
  $("front").value = pre.front; $("back").value = pre.back;
  $("front").focus();

  setStatus("Loading decks…");
  try {
    const decks = await ankiRequest(fetch, cfg.server, cfg.token, "deckNames");
    for (const d of decks) $("deck").append(new Option(d, d));
    if (!decks.length) { $("deck").append(new Option("Default", "Default")); }
    if (cfg.deck && decks.includes(cfg.deck)) $("deck").value = cfg.deck;
    setStatus("");
  } catch (e) { setStatus(e.message, "err"); }
}

function syncModel() {
  const cloze = $("model").value === "Cloze";
  $("backLabel").textContent = cloze ? "Back extra" : "Back";
  $("clozeBtn").hidden = !cloze;
}

async function add(ev) {
  ev?.preventDefault();
  const btn = $("add");
  let note;
  try {
    note = buildNote({ front: $("front").value, back: $("back").value, deck: $("deck").value, tags: $("tags").value, model: $("model").value, sourceUrl: source.url, sourceTitle: source.title, includeSource: $("includeSource").checked });
  } catch (e) { setStatus(e.message, "err"); return; }
  btn.disabled = true; setStatus("Adding…");
  try {
    if ($("deck").value === "Default") await ankiRequest(fetch, cfg.server, cfg.token, "createDeck", { deck: "Default" }).catch(() => {});
    await ankiRequest(fetch, cfg.server, cfg.token, "addNote", { note });
    await chrome.storage.sync.set({ deck: $("deck").value, model: $("model").value, tags: $("tags").value, includeSource: $("includeSource").checked });
    setStatus("Added ✓", "ok");
    setTimeout(() => window.close(), 700);
  } catch (e) { setStatus(e.message, "err"); } finally { btn.disabled = false; }
}

$("form").addEventListener("submit", add);
$("model").addEventListener("change", syncModel);
$("clozeBtn").addEventListener("click", () => {
  const t = $("front");
  const s = t.selectionStart, e = t.selectionEnd;
  t.value = clozeWrap(t.value, s, e);
  t.focus();
});
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") add(e); });
init();
