import { ankiRequest, normalizeServerUrl } from "./lib.js";

const $ = (id) => document.getElementById(id);
const setStatus = (text, kind = "") => { const s = $("status"); s.textContent = text; s.className = `status ${kind}`; };

function read() {
  const server = normalizeServerUrl($("server").value);
  const token = $("token").value.trim();
  if (!token) throw new Error("API token is required");
  return { server, token };
}

async function test() {
  try {
    const { server, token } = read();
    setStatus("Connecting…");
    const decks = await ankiRequest(fetch, server, token, "deckNames");
    setStatus(`Connected ✓ — ${decks.length} deck${decks.length === 1 ? "" : "s"}`, "ok");
    return true;
  } catch (e) { setStatus(e.message, "err"); return false; }
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { server, token } = read();
    await chrome.storage.sync.set({ server, token });
    $("server").value = server;
    if (await test()) setStatus("Saved ✓ — connection works", "ok");
  } catch (err) { setStatus(err.message, "err"); }
});
$("test").addEventListener("click", test);

chrome.storage.sync.get(["server", "token"]).then(({ server, token }) => { $("server").value = server ?? ""; $("token").value = token ?? ""; });
