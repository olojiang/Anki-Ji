// End-to-end smoke test against a running deployment.  BASE_URL=https://… node scripts/smoke.mjs
const BASE = process.env.BASE_URL || "http://localhost:3300";
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.log("  ✗", msg); } };

function client() {
  let cookie = "";
  const call = async (path, { method, body, form } = {}) => {
    const res = await fetch(BASE + path, {
      method: method ?? (body || form ? "POST" : "GET"),
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined), redirect: "manual",
    });
    const sc = res.headers.get("set-cookie");
    if (sc && sc.includes("ak_session=")) cookie = sc.split(";")[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return call;
}

const stamp = Date.now();
const A = client(), B = client();
const emailA = `smoke-a-${stamp}@example.com`, emailB = `smoke-b-${stamp}@example.com`, PW = "Passw0rd!x";

console.log("auth");
ok((await A("/api/auth/register", { body: { email: emailA, password: PW, name: "Smoke A" } })).status === 200, "register A");
ok((await B("/api/auth/register", { body: { email: emailB, password: PW, name: "Smoke B" } })).status === 200, "register B");
ok((await A("/api/auth/register", { body: { email: emailA, password: PW } })).status === 409, "duplicate email rejected");
ok((await client()("/api/decks")).status === 401, "anonymous blocked");
ok((await client()("/api/auth/login", { body: { email: emailA, password: "wrong" } })).status === 401, "wrong password rejected");

console.log("decks");
const root = (await A("/api/decks", { body: { name: `Smoke ${stamp}` } })).data.deck;
const child = (await A("/api/decks", { body: { name: "Child", parentId: root.id } })).data.deck;
const grand = (await A("/api/decks", { body: { name: "Grandchild", parentId: child.id } })).data.deck;
ok(root && child && grand && grand.parentId === child.id, "nested decks (3 levels)");
ok((await A(`/api/decks/${root.id}/move`, { body: { parentId: grand.id, index: 0 } })).status === 400, "cycle move rejected");

console.log("notes");
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgYGD4z8DAwMDAAAAPAAHNmyQnAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
const fd = new FormData(); fd.append("file", new Blob([png], { type: "image/png" }), "dot.png");
const media = await A("/api/media", { form: fd });
ok(media.status === 200 && typeof media.data.url === "string", `image upload (${String(media.data.url).slice(0, 40)}…)`);
const basic = await A("/api/notes", { body: { deckId: grand.id, type: "basic", fields: { front: "Capital of France?", back: "**Paris**" }, tags: ["geo::europe"] } });
const cloze = await A("/api/notes", { body: { deckId: child.id, type: "cloze", fields: { text: "{{c1::Tokyo}} is the capital of {{c2::Japan}}", extra: "" }, tags: ["geo"] } });
const image = await A("/api/notes", { body: { deckId: root.id, type: "basic", fields: { front: `What is this? ![](${media.data.url})`, back: "A dot" }, tags: [] } });
const occl = await A("/api/notes", { body: { deckId: root.id, type: "image_occlusion", fields: { image: media.data.url, masks: [{ x: 0, y: 0, w: 50, h: 50 }, { x: 50, y: 50, w: 50, h: 50 }], header: "Parts" }, tags: [] } });
ok(basic.status === 200 && cloze.status === 200 && image.status === 200 && occl.status === 200, "basic + cloze + image + occlusion notes created");
const all = (await A(`/api/notes?q=${encodeURIComponent(`deck:"Smoke ${stamp}"`)}`)).data.rows;
ok(all.length === 6, `search by deck finds 6 cards (got ${all.length})`);
ok((await A(`/api/notes?q=${encodeURIComponent("tag:geo")}`)).data.rows.length === 3, "tag search (hierarchical)");

console.log("isolation");
ok((await B("/api/notes")).data.rows.every((r) => r.deckId !== root.id), "B cannot list A's cards");
ok((await B(`/api/decks/${root.id}`)).status === 404, "B cannot read A's deck");
ok((await B(`/api/decks/${root.id}`, { method: "PATCH", body: { name: "pwn" } })).status === 404, "B cannot rename A's deck");
ok((await B(`/api/notes/${basic.data.note.id}`)).status === 404, "B cannot read A's note");
ok((await B("/api/notes", { body: { deckId: root.id, type: "basic", fields: { front: "x", back: "y" } } })).status === 404, "B cannot add to A's deck");
ok((await B(`/api/study/${root.id}`)).status === 404, "B cannot study A's deck");
ok((await B("/api/study/answer", { body: { cardId: all[0].cardId, rating: 3 } })).status === 404, "B cannot answer A's card");
await B(`/api/decks/${root.id}`, { method: "DELETE" });
ok((await A(`/api/decks/${root.id}`)).data.deck?.deletedAt === null, "B's delete had no effect");

console.log("study");
let st = (await A(`/api/study/${root.id}`)).data;
ok(st.counts.new === 4 && st.card, `queue has 4 new cards — siblings buried (${st.counts.new})`);
ok(st.card && Object.keys(st.card.intervals).length === 4, `interval previews ${JSON.stringify(st.card?.intervals)}`);
const seen = [];
for (const rating of [3, 1, 4, 2]) {
  if (!st.card) break;
  seen.push(st.card.cardId);
  const r = await A("/api/study/answer", { body: { cardId: st.card.cardId, rating, durationMs: 1500, deckId: root.id } });
  ok(r.status === 200, `answer rating ${rating}`);
  st = r.data.next;
}
const undo = await A("/api/study/undo", { body: { deckId: root.id } });
ok(undo.status === 200 && undo.data.undone?.cardId === seen[seen.length - 1], "undo last answer");
const stats = (await A("/api/stats")).data;
ok(stats.today.reviews >= 3, `stats: ${stats.today.reviews} reviews today`);

console.log("filtered deck + tags");
const f = await A("/api/decks", { body: { name: "Cram", filtered: true, filter: { query: "tag:geo", limit: 50, order: "due" } } });
ok(f.status === 200, "filtered deck created");
await A(`/api/decks/${f.data.deck.id}/empty`, { body: {} });
await A(`/api/decks/${f.data.deck.id}`, { method: "DELETE" });
ok((await A("/api/tags", { method: "PATCH", body: { from: "geo", to: "geography" } })).status === 200, "rename tag");
ok((await A("/api/tags")).data.tags.includes("geography::europe"), "child tag renamed too");

console.log("export / import");
const backup = (await A("/api/export?format=json")).data;
ok(backup.format === "anki-ji-backup" && backup.notes.length >= 4 && backup.revlog.length >= 3, `backup: ${backup.notes.length} notes, ${backup.cards.length} cards, ${backup.revlog.length} reviews, ${backup.media.length} media`);
const csv = await A("/api/export?format=csv");
ok(typeof csv.data === "string" && csv.data.includes("fields_json"), "CSV export");
const deckMap = (await B("/api/import/decks", { body: { decks: backup.decks } })).data.deckMap;
const imp = (await B("/api/import/notes", { body: { notes: backup.notes, cards: backup.cards, revlog: backup.revlog, deckMap } })).data;
ok(imp.notes === backup.notes.length && imp.cards === backup.cards.length, `import into B: ${JSON.stringify(imp)}`);
const again = (await B("/api/export?format=json")).data;
const guids = new Set(backup.notes.map((n) => n.guid));
const sig = (b) => JSON.stringify(b.notes.filter((n) => guids.has(n.guid)).map((n) => [n.guid, n.type, n.fields, [...n.tags].sort()]).sort());
ok(sig(again) === sig(backup), "round-trip notes identical");
ok(again.revlog.length === backup.revlog.length && again.cards.filter((c) => c.state !== "new").length === backup.cards.filter((c) => c.state !== "new").length, "round-trip scheduling + review log identical");
const dup = (await B("/api/import/notes", { body: { notes: backup.notes, cards: backup.cards, revlog: [], deckMap } })).data;
ok(dup.skipped === backup.notes.length, "re-import skips duplicates");

console.log("cleanup");
ok((await A("/api/auth/account", { method: "DELETE", body: { password: PW } })).status === 200, "delete account A");
ok((await B("/api/auth/account", { method: "DELETE", body: { password: PW } })).status === 200, "delete account B");
ok((await client()("/api/auth/login", { body: { email: emailA, password: PW } })).status === 401, "A can no longer log in");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
