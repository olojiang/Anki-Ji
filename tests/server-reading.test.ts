import { describe, it, expect, beforeAll } from "vitest";
import { usePglite } from "./helpers/pglite";
import * as users from "@/server/repo/users";
import {
  createReadingItem, listReadingItems, getReadingItem, updateReadingItem, deleteReadingItem, readingAction, createExtract,
  getReadingQueue, getReadingPrefs, setReadingPrefs, MAX_READING_CHARS,
} from "@/server/services/reading";
import { fetchArticle } from "@/server/services/article";

describe("incremental reading (PGlite)", () => {
  let a: number, b: number;
  let art: number;
  const TODAY = 1000;
  beforeAll(async () => {
    await usePglite();
    a = (await users.createUser("ra@test.dev", "h", "A")).id;
    b = (await users.createUser("rb@test.dev", "h", "B")).id;
  });

  it("imports pasted text as a reading item due today", async () => {
    const it1 = await createReadingItem(a, { title: "FSRS paper", content: "Para one.\n\nPara two.", priority: 80 }, TODAY);
    expect(it1).toMatchObject({ title: "FSRS paper", priority: 80, status: "active", dueDay: TODAY, intervalDays: 0, reps: 0, position: 0, parentId: null });
    art = it1.id;
    await createReadingItem(a, { title: "", content: "Untitled body text here", priority: 20 }, TODAY);
    const list = await listReadingItems(a);
    expect(list.length).toBe(2);
    expect(list.find((x) => x.priority === 20)!.title).toBe("Untitled body text here");
    expect((list[0] as Record<string, unknown>).content).toBeUndefined();
    expect(list.find((x) => x.id === art)!.length).toBe("Para one.\n\nPara two.".length);
  });

  it("validates input", async () => {
    await expect(createReadingItem(a, { title: "x", content: "   " }, TODAY)).rejects.toMatchObject({ status: 400 });
    await expect(createReadingItem(a, { title: "x", content: "a".repeat(MAX_READING_CHARS + 1) }, TODAY)).rejects.toMatchObject({ status: 413 });
  });

  it("remembers reading position and updates priority", async () => {
    expect(await updateReadingItem(a, art, { position: 11, priority: 95 })).toBe(true);
    const it1 = await getReadingItem(a, art);
    expect(it1!.position).toBe(11);
    expect(it1!.priority).toBe(95);
    expect(it1!.content).toContain("Para two");
    await updateReadingItem(a, art, { position: 99999 });
    expect((await getReadingItem(a, art))!.position).toBe("Para one.\n\nPara two.".length);
  });

  it("read enough → interval grows; postpone; done; reopen", async () => {
    let x = await readingAction(a, art, "read", TODAY);
    expect(x).toMatchObject({ intervalDays: 1, dueDay: TODAY + 1, reps: 1 });
    x = await readingAction(a, art, "read", TODAY + 1);
    expect(x).toMatchObject({ intervalDays: 2, dueDay: TODAY + 3, reps: 2 });
    x = await readingAction(a, art, "postpone", TODAY + 3, 5);
    expect(x!.dueDay).toBe(TODAY + 8);
    x = await readingAction(a, art, "done", TODAY + 3);
    expect(x!.status).toBe("done");
    x = await readingAction(a, art, "reopen", TODAY + 4);
    expect(x).toMatchObject({ status: "active", dueDay: TODAY + 4 });
  });

  it("extracts become child items inheriting priority, due tomorrow", async () => {
    const e = await createExtract(a, art, "Para two.", TODAY + 4);
    expect(e).toMatchObject({ parentId: art, priority: 95, dueDay: TODAY + 5, content: "Para two.", title: "Para two." });
    const parent = await getReadingItem(a, art);
    expect(parent!.children.map((c) => c.id)).toEqual([e.id]);
  });

  it("queue is ordered by priority then due, and capped by prefs", async () => {
    expect(await getReadingPrefs(a)).toEqual({ dailyCap: 20 });
    const q1 = await getReadingQueue(a, TODAY + 5);
    expect(q1.queue.map((x) => x.priority)).toEqual([95, 95, 20]); // art (due +4), extract (due +5), untitled (due TODAY)
    expect(q1.queue[0].id).toBe(art);
    await setReadingPrefs(a, { dailyCap: 1 });
    const q2 = await getReadingQueue(a, TODAY + 5);
    expect(q2.queue.length).toBe(1);
    expect(q2.overflow).toBe(2);
    expect(q2.cap).toBe(1);
  });

  it("isolates reading items between users", async () => {
    expect(await listReadingItems(b)).toEqual([]);
    expect(await getReadingItem(b, art)).toBeNull();
    expect(await updateReadingItem(b, art, { priority: 1 })).toBe(false);
    expect(await readingAction(b, art, "done", TODAY)).toBeNull();
    await expect(createExtract(b, art, "steal", TODAY)).rejects.toMatchObject({ status: 404 });
    expect(await deleteReadingItem(b, art)).toBe(false);
    expect((await getReadingQueue(b, TODAY + 100)).queue).toEqual([]);
    expect((await getReadingItem(a, art))!.priority).toBe(95);
  });

  it("deleting an item removes its extracts", async () => {
    expect(await deleteReadingItem(a, art)).toBe(true);
    expect((await listReadingItems(a)).length).toBe(1);
  });
});

describe("server-side article fetch", () => {
  const html = "<html><head><title>Hello</title></head><body><article><p>Body text</p></article></body></html>";
  const okFetch = async () => new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const publicDns = async () => ["93.184.216.34"];

  it("fetches and converts html to text", async () => {
    const r = await fetchArticle("https://example.com/post", { fetchImpl: okFetch as typeof fetch, resolve: publicDns });
    expect(r).toEqual({ title: "Hello", content: "Body text", sourceUrl: "https://example.com/post" });
  });
  it("blocks hosts that resolve to private addresses (SSRF)", async () => {
    await expect(fetchArticle("https://evil.example/", { fetchImpl: okFetch as typeof fetch, resolve: async () => ["127.0.0.1"] })).rejects.toThrow("blocked_url");
    await expect(fetchArticle("http://169.254.169.254/latest", { fetchImpl: okFetch as typeof fetch, resolve: publicDns })).rejects.toThrow("blocked_url");
  });
  it("re-checks redirects", async () => {
    const redirect = async () => new Response("", { status: 302, headers: { location: "http://10.0.0.1/admin" } });
    await expect(fetchArticle("https://example.com/r", { fetchImpl: redirect as typeof fetch, resolve: async (h: string) => (h === "example.com" ? ["93.184.216.34"] : ["10.0.0.1"]) })).rejects.toThrow("blocked_url");
  });
  it("rejects non-text content and failed responses", async () => {
    const pdf = async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } });
    await expect(fetchArticle("https://example.com/a.pdf", { fetchImpl: pdf as typeof fetch, resolve: publicDns })).rejects.toThrow("unsupported_content");
    const bad = async () => new Response("no", { status: 404 });
    await expect(fetchArticle("https://example.com/x", { fetchImpl: bad as typeof fetch, resolve: publicDns })).rejects.toThrow("fetch_failed");
  });
  it("passes plain text / markdown through", async () => {
    const md = async () => new Response("# Title\n\nHi", { status: 200, headers: { "content-type": "text/markdown" } });
    const r = await fetchArticle("https://example.com/readme.md", { fetchImpl: md as typeof fetch, resolve: publicDns });
    expect(r.content).toBe("# Title\n\nHi");
    expect(r.title).toBe("Title");
  });
});
